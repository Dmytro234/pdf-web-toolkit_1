from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, current_app, request, session

from app.extensions import limiter
from app.routes.session import _JOBS, _JOBS_LOCK
from app.services.delete_pages_service import DeletePagesService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager

logger = structlog.get_logger(__name__)

delete_pages_bp = Blueprint("delete_pages", __name__, url_prefix="/api/v1/delete-pages")


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
            "type": "delete_pages",
        }
    return job_id


def _update_job(job_id: str, **updates: Any) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


@delete_pages_bp.post("/execute")
@limiter.limit("20/minute")
def execute_delete_pages():
    """
    Start async delete-pages job.
    Body: {"file_id": "...", "pages_to_delete": [1, 3]}
    """
    payload = request.get_json(silent=True) or {}
    file_id = payload.get("file_id")
    pages_to_delete = payload.get("pages_to_delete")

    if not isinstance(file_id, str) or not file_id.strip():
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "file_id is required.",
            http_status=400,
        )

    if not isinstance(pages_to_delete, list) or not pages_to_delete:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "pages_to_delete must be a non-empty list of 0-based page indices.",
            http_status=400,
        )

    if not all(isinstance(item, int) and item >= 0 for item in pages_to_delete):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "pages_to_delete must contain only non-negative integers.",
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

    if record.page_count is not None and len(set(pages_to_delete)) >= int(record.page_count):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "Cannot delete all pages from the PDF.",
            http_status=400,
        )

    pdf_path = Path(record.path)
    job_id = _create_job()

    def _worker(app, worker_job_id: str, worker_pdf_path: Path, worker_pages: list[int]) -> None:
        with app.app_context():
            try:
                _update_job(worker_job_id, status="running", progress=15)
                service = DeletePagesService()
                output_path = service.delete_pages(worker_pdf_path, worker_pages)

                _update_job(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(output_path),
                )
                logger.info("delete_pages.job_success", job_id=worker_job_id, output=str(output_path))
            except Exception as exc:
                logger.exception("delete_pages.job_failed", job_id=worker_job_id, error=str(exc))
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
        args=(current_app._get_current_object(), job_id, pdf_path, list(pages_to_delete)),
        daemon=True,
    )
    thread.start()

    return success_response(
        {
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
        }
    )