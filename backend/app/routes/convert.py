from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, current_app, request, session

from app.extensions import limiter
from app.routes.session import _JOBS, _JOBS_LOCK
from app.services.convert_service import ConvertService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager

logger = structlog.get_logger(__name__)

convert_bp = Blueprint("convert", __name__, url_prefix="/api/v1/convert")


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
            "type": "convert",
        }
    return job_id


def _update_job(job_id: str, **updates: Any) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


@convert_bp.post("/execute")
@limiter.limit("20/minute")
def execute_convert():
    """
    Start async conversion job.

    Supported pairs:
    - pdf -> jpg
    - pdf -> png
    - jpg -> pdf
    - png -> pdf
    - webp -> pdf
    - docx -> pdf
    """
    payload = request.get_json(silent=True) or {}
    file_id = payload.get("file_id")
    from_format = str(payload.get("from_format", "")).lower().strip()
    to_format = str(payload.get("to_format", "")).lower().strip()
    dpi = int(payload.get("dpi", 150))
    quality = int(payload.get("quality", 85))

    if not isinstance(file_id, str) or not file_id.strip():
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "file_id is required.",
            http_status=400,
        )

    supported_pairs = {
        ("pdf", "jpg"),
        ("pdf", "png"),
        ("jpg", "pdf"),
        ("png", "pdf"),
        ("webp", "pdf"),
        ("docx", "pdf"),
    }
    if (from_format, to_format) not in supported_pairs:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "Unsupported conversion pair.",
            details={
                "supported_pairs": sorted([f"{src}->{dst}" for src, dst in supported_pairs]),
            },
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

    source_path = Path(record.path)
    job_id = _create_job()

    def _worker(app, worker_job_id: str, worker_source_path: Path) -> None:
        with app.app_context():
            try:
                _update_job(worker_job_id, status="running", progress=10)
                service = ConvertService()

                if from_format == "pdf" and to_format in {"jpg", "png"}:
                    result_path = service.pdf_to_images(
                        pdf_path=worker_source_path,
                        format=to_format,
                        dpi=dpi,
                        quality=quality,
                    )
                elif from_format in {"jpg", "png", "webp"} and to_format == "pdf":
                    job_dir = Path(current_app.config["TEMP_DIR"]).resolve() / "jobs" / worker_job_id
                    job_dir.mkdir(parents=True, exist_ok=True)
                    output_path = job_dir / f"{worker_source_path.stem}.pdf"
                    result_path = service.images_to_pdf([worker_source_path], output_path)
                elif from_format == "docx" and to_format == "pdf":
                    result_path = service.docx_to_pdf(worker_source_path)
                else:
                    raise ValueError("Unsupported conversion pair.")

                _update_job(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(result_path),
                )
                logger.info(
                    "convert.job_success",
                    job_id=worker_job_id,
                    output=str(result_path),
                    from_format=from_format,
                    to_format=to_format,
                )
            except Exception as exc:
                logger.exception("convert.job_failed", job_id=worker_job_id, error=str(exc))
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
        args=(current_app._get_current_object(), job_id, source_path),
        daemon=True,
    )
    thread.start()

    return success_response(
        {
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
        }
    )