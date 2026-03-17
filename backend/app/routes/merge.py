from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, current_app, request, session

from app.extensions import limiter
from app.routes.session import jobs_lock, jobs_registry
from app.services.merge_service import MergeService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager


logger = structlog.get_logger(__name__)

merge_bp = Blueprint("merge", __name__, url_prefix="/api/v1/merge")


def ensure_session_id() -> str:
    session_id = session.get("session_id")

    if not session_id:
        session_id = uuid.uuid4().hex
        session["session_id"] = session_id
        session.permanent = False

    return str(session_id)


def create_merge_job_record() -> str:
    job_id = uuid.uuid4().hex

    with jobs_lock:
        jobs_registry[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "result_path": None,
            "created_at": None,
            "type": "merge",
        }

    return job_id


def update_merge_job_record(job_id: str, **updates: Any) -> None:
    with jobs_lock:
        if job_id in jobs_registry:
            jobs_registry[job_id].update(updates)


@merge_bp.post("/execute")
@limiter.limit("20/minute")
def execute_merge():
    request_payload = request.get_json(silent=True) or {}
    file_ids = request_payload.get("file_ids")
    file_order = request_payload.get("order")

    if not isinstance(file_ids, list) or not file_ids:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "file_ids must be a non-empty list.",
            http_status=400,
        )

    if not isinstance(file_order, list) or len(file_order) != len(file_ids):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "order must be a list with the same length as file_ids.",
            http_status=400,
        )

    expected_indices = list(range(len(file_ids)))
    if sorted(file_order) != expected_indices:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "order must be a valid permutation of file_ids indices.",
            http_status=400,
        )

    session_id = ensure_session_id()
    session_manager = SessionManager()

    file_records = []
    for file_id in file_ids:
        file_record = session_manager.get_file(session_id, str(file_id))
        if file_record is None:
            return error_response(
                ErrorCode.PROCESSING_FAILED,
                f"File not found: {file_id}",
                details={"file_id": file_id},
                http_status=404,
            )
        file_records.append(file_record)

    source_file_paths = [Path(file_record.path) for file_record in file_records]
    job_id = create_merge_job_record()

    def merge_worker(
        application,
        worker_job_id: str,
        worker_source_file_paths: list[Path],
        worker_file_order: list[int],
    ) -> None:
        with application.app_context():
            try:
                update_merge_job_record(
                    worker_job_id,
                    status="running",
                    progress=10,
                )

                merge_service = MergeService()
                output_file_path = merge_service.merge(
                    worker_source_file_paths,
                    worker_file_order,
                )

                update_merge_job_record(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(output_file_path),
                )

                logger.info(
                    "merge.job_success",
                    job_id=worker_job_id,
                    output=str(output_file_path),
                )

            except Exception as error:
                logger.exception(
                    "merge.job_failed",
                    job_id=worker_job_id,
                    error=str(error),
                )

                update_merge_job_record(
                    worker_job_id,
                    status="failed",
                    progress=100,
                    error={
                        "code": ErrorCode.PROCESSING_FAILED.value,
                        "message": str(error),
                    },
                )

    worker_thread = threading.Thread(
        target=merge_worker,
        args=(
            current_app._get_current_object(),
            job_id,
            source_file_paths,
            file_order,
        ),
        daemon=True,
    )
    worker_thread.start()

    return success_response(
        data={
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
        }
    )