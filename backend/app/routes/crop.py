from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, current_app, request, session

from app.extensions import limiter
from app.routes.session import _JOBS, _JOBS_LOCK
from app.services.crop_service import CropService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager

logger = structlog.get_logger(__name__)

crop_bp = Blueprint("crop", __name__, url_prefix="/api/v1/crop")


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
            "type": "crop",
        }
    return job_id


def _update_job(job_id: str, **updates: Any) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


@crop_bp.post("/execute")
@limiter.limit("20/minute")
def execute_crop():
    """
    Start async crop job.
    Body: {file_id, apply_to, pages?, margins, unit}
    """
    payload = request.get_json(silent=True) or {}

    file_id = payload.get("file_id")
    apply_to = payload.get("apply_to")
    pages = payload.get("pages")
    margins = payload.get("margins")
    unit = str(payload.get("unit", "pt")).lower().strip()

    if not isinstance(file_id, str) or not file_id.strip():
        return error_response(ErrorCode.PROCESSING_FAILED, "file_id is required.", http_status=400)

    if apply_to not in {"all", "pages"}:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "apply_to must be 'all' or 'pages'.",
            http_status=400,
        )

    if apply_to == "pages":
        if not isinstance(pages, list) or not pages:
            return error_response(
                ErrorCode.PROCESSING_FAILED,
                "pages must be a non-empty list when apply_to='pages'.",
                http_status=400,
            )
        if not all(isinstance(item, int) and item >= 0 for item in pages):
            return error_response(
                ErrorCode.PROCESSING_FAILED,
                "pages must contain only non-negative integers.",
                http_status=400,
            )

    if not isinstance(margins, dict):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "margins must be an object with top/right/bottom/left.",
            http_status=400,
        )

    required_keys = {"top", "right", "bottom", "left"}
    if set(margins.keys()) != required_keys:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "margins must contain exactly: top, right, bottom, left.",
            http_status=400,
        )

    try:
        for key in required_keys:
            if float(margins[key]) < 0:
                raise ValueError(f"{key} must be non-negative")
    except (TypeError, ValueError):
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "All margin values must be numeric and non-negative.",
            http_status=400,
        )

    if unit not in {"pt", "mm", "px"}:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "unit must be one of: pt, mm, px.",
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

    target_pages: list[int] | str = "all" if apply_to == "all" else list(pages)
    pdf_path = Path(record.path)
    job_id = _create_job()

    def _worker(
        app,
        worker_job_id: str,
        worker_pdf_path: Path,
        worker_margins: dict,
        worker_pages: list[int] | str,
        worker_unit: str,
    ) -> None:
        with app.app_context():
            try:
                _update_job(worker_job_id, status="running", progress=15)
                service = CropService()
                output_path = service.crop_pages(
                    pdf_path=worker_pdf_path,
                    margins=worker_margins,
                    pages=worker_pages,
                    unit=worker_unit,  # type: ignore[arg-type]
                )

                _update_job(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(output_path),
                )
                logger.info("crop.job_success", job_id=worker_job_id, output=str(output_path))
            except Exception as exc:
                logger.exception("crop.job_failed", job_id=worker_job_id, error=str(exc))
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
        args=(current_app._get_current_object(), job_id, pdf_path, margins, target_pages, unit),
        daemon=True,
    )
    thread.start()

    return success_response(
        {
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
        }
    )