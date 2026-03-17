from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, current_app, request, session

from app.extensions import limiter
from app.routes.session import _JOBS, _JOBS_LOCK
from app.services.split_service import SplitService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager

logger = structlog.get_logger(__name__)

split_bp = Blueprint("split", __name__, url_prefix="/api/v1/split")


def _ensure_session_id() -> str:
    session_id = session.get("session_id")
    if not session_id:
        session_id = uuid.uuid4().hex
        session["session_id"] = session_id
        session.permanent = False
    return str(session_id)


def _create_job() -> str:
    job_id = uuid.uuid4().hex
    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "result_path": None,
            "type": "split",
        }
    return job_id


def _update_job(job_id: str, **updates: Any) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


@split_bp.post("/execute")
@limiter.limit("20/minute")
def execute_split():
    """
    Start async split job.
    """
    payload = request.get_json(silent=True) or {}

    file_id = payload.get("file_id")
    mode = payload.get("mode")
    pages_per_chunk = payload.get("pages_per_chunk")
    size_mb = payload.get("size_mb")
    ranges = payload.get("ranges")

    valid_modes = {"pages", "size", "each_page", "ranges"}
    if mode not in valid_modes:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            f"mode must be one of {sorted(valid_modes)}",
            http_status=400,
        )

    if mode == "pages" and (not isinstance(pages_per_chunk, int) or pages_per_chunk <= 0):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "pages_per_chunk must be a positive integer for mode='pages'.",
            http_status=400,
        )

    if mode == "size" and (not isinstance(size_mb, int) or size_mb <= 0):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "size_mb must be a positive integer for mode='size'.",
            http_status=400,
        )

    if mode == "ranges" and (
        not isinstance(ranges, list)
        or not ranges
        or not all(isinstance(item, str) and item.strip() for item in ranges)
    ):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "ranges must be a non-empty list of strings for mode='ranges'.",
            http_status=400,
        )

    if not isinstance(file_id, str) or not file_id.strip():
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "file_id is required.",
            http_status=400,
        )

    session_id = _ensure_session_id()
    manager = SessionManager()
    record = manager.get_file(session_id, file_id)

    if record is None:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "File not found.",
            details={"file_id": file_id},
            http_status=404,
        )

    pdf_path = Path(record.path)
    job_id = _create_job()

    def _worker(app, worker_job_id: str, worker_mode: str, worker_pdf_path: Path) -> None:
        with app.app_context():
            try:
                _update_job(worker_job_id, status="running", progress=10)
                service = SplitService()

                if worker_mode == "pages":
                    output_files = service.split_by_pages(worker_pdf_path, int(pages_per_chunk))
                elif worker_mode == "size":
                    output_files = service.split_by_size(worker_pdf_path, int(size_mb))
                elif worker_mode == "each_page":
                    output_files = service.split_each_page(worker_pdf_path)
                else:
                    output_files = service.split_by_ranges(worker_pdf_path, list(ranges))

                _update_job(worker_job_id, progress=85)
                zip_path = service._create_zip(output_files)

                _update_job(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(zip_path),
                )
                logger.info(
                    "split.job_success",
                    job_id=worker_job_id,
                    output=str(zip_path),
                    parts=len(output_files),
                )
            except Exception as exc:
                logger.exception("split.job_failed", job_id=worker_job_id, error=str(exc))
                _update_job(
                    worker_job_id,
                    status="failed",
                    progress=100,
                    error={
                        "code": ErrorCode.PROCESSING_FAILED.value,
                        "message": str(exc),
                    },
                )

    thread = threading.Thread(
        target=_worker,
        args=(current_app._get_current_object(), job_id, mode, pdf_path),
        daemon=True,
    )
    thread.start()

    return success_response(
        {
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
        }
    )