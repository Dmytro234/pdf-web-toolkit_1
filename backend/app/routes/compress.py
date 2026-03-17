from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, current_app, request, session

from app.extensions import limiter
from app.routes.session import _JOBS, _JOBS_LOCK
from app.services.compress_service import CompressService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager

logger = structlog.get_logger(__name__)

compress_bp = Blueprint("compress", __name__, url_prefix="/api/v1/compress")


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
            "type": "compress",
        }
    return job_id


def _update_job(job_id: str, **updates: Any) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


@compress_bp.post("/execute")
@limiter.limit("20/minute")
def execute_compress():
    """
    Start async compression job.
    Body: {file_id, level, optimize_images, image_quality, remove_metadata}
    """
    payload = request.get_json(silent=True) or {}

    file_id = payload.get("file_id")
    level = str(payload.get("level", "medium")).lower()
    optimize_images = bool(payload.get("optimize_images", False))
    image_quality = int(payload.get("image_quality", 70))
    remove_metadata = bool(payload.get("remove_metadata", False))

    if not isinstance(file_id, str) or not file_id.strip():
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "file_id is required.",
            http_status=400,
        )

    if level not in {"low", "medium", "high", "extreme"}:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "level must be one of: low, medium, high, extreme.",
            http_status=400,
        )

    if image_quality < 1 or image_quality > 100:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "image_quality must be between 1 and 100.",
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
    original_size = pdf_path.stat().st_size
    job_id = _create_job()

    def _worker(app, worker_job_id: str, worker_pdf_path: Path) -> None:
        with app.app_context():
            try:
                _update_job(worker_job_id, status="running", progress=10)
                service = CompressService()

                output_path = service.compress(
                    worker_pdf_path,
                    level=level,
                    optimize_images=optimize_images,
                    image_quality=image_quality,
                    remove_metadata=remove_metadata,
                )

                compressed_size = output_path.stat().st_size
                reduction_percent = 0.0
                if original_size > 0:
                    reduction_percent = round((1 - (compressed_size / original_size)) * 100, 2)

                _update_job(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(output_path),
                    original_size=original_size,
                    compressed_size=compressed_size,
                    reduction_percent=reduction_percent,
                )

                logger.info(
                    "compress.job_success",
                    job_id=worker_job_id,
                    original_size=original_size,
                    compressed_size=compressed_size,
                    reduction_percent=reduction_percent,
                    output=str(output_path),
                )
            except Exception as exc:
                logger.exception("compress.job_failed", job_id=worker_job_id, error=str(exc))
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
        args=(current_app._get_current_object(), job_id, pdf_path),
        daemon=True,
    )
    thread.start()

    return success_response(
        {
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
            "original_size": original_size,
            "compressed_size": None,
            "reduction_percent": None,
        }
    )