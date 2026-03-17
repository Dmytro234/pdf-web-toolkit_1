from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, current_app, request, session

from app.extensions import limiter
from app.routes.session import _JOBS, _JOBS_LOCK
from app.services.align_service import AlignService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager

logger = structlog.get_logger(__name__)

align_bp = Blueprint("align", __name__, url_prefix="/api/v1/align")


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
            "type": "align",
        }
    return job_id


def _update_job(job_id: str, **updates: Any) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


@align_bp.post("/execute")
@limiter.limit("20/minute")
def execute_align():
    """
    Start async align job.
    Body: {file_id, auto_rotate, normalize_size, target_size, orientation}
    """
    payload = request.get_json(silent=True) or {}

    file_id = payload.get("file_id")
    auto_rotate = bool(payload.get("auto_rotate", False))
    normalize_size = bool(payload.get("normalize_size", False))
    target_size = str(payload.get("target_size", "A4")).strip()
    orientation = str(payload.get("orientation", "portrait")).strip().lower()

    if not isinstance(file_id, str) or not file_id.strip():
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "file_id is required.",
            http_status=400,
        )

    if target_size not in {"A4", "Letter"}:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "target_size must be 'A4' or 'Letter'.",
            http_status=400,
        )

    if orientation not in {"portrait", "landscape"}:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "orientation must be 'portrait' or 'landscape'.",
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

    def _worker(
        app,
        worker_job_id: str,
        worker_pdf_path: Path,
        worker_auto_rotate: bool,
        worker_normalize_size: bool,
        worker_target_size: str,
        worker_orientation: str,
    ) -> None:
        with app.app_context():
            try:
                _update_job(worker_job_id, status="running", progress=15)
                service = AlignService()
                output_path = service.align(
                    pdf_path=worker_pdf_path,
                    auto_rotate=worker_auto_rotate,
                    normalize_size=worker_normalize_size,
                    target_size=worker_target_size,
                    orientation=worker_orientation,
                )

                _update_job(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(output_path),
                )
                logger.info("align.job_success", job_id=worker_job_id, output=str(output_path))
            except Exception as exc:
                logger.exception("align.job_failed", job_id=worker_job_id, error=str(exc))
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
        args=(
            current_app._get_current_object(),
            job_id,
            pdf_path,
            auto_rotate,
            normalize_size,
            target_size,
            orientation,
        ),
        daemon=True,
    )
    thread.start()

    return success_response(
        {
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
        }
    )