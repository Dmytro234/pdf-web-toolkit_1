from __future__ import annotations

import threading
import uuid
from pathlib import Path
from typing import Any, Literal, Union

import structlog
from flask import Blueprint, current_app, request, session
from pydantic import BaseModel, Field, ValidationError, field_validator

from app.extensions import limiter
from app.routes.session import _JOBS, _JOBS_LOCK
from app.services.edit_service import EditService
from app.utils.response_helpers import ErrorCode, error_response, success_response
from app.utils.session_manager import SessionManager

logger = structlog.get_logger(__name__)

edit_bp = Blueprint("edit", __name__, url_prefix="/api/v1/edit")


class ReorderOperation(BaseModel):
    type: Literal["reorder"]
    order: list[int]

    @field_validator("order")
    @classmethod
    def validate_order(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("order must not be empty")
        return value


class RotateOperation(BaseModel):
    type: Literal["rotate"]
    page: int = Field(ge=0)
    degrees: Literal[90, 180, 270]


class DeleteOperation(BaseModel):
    type: Literal["delete"]
    pages: list[int]

    @field_validator("pages")
    @classmethod
    def validate_pages(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("pages must not be empty")
        if any(page < 0 for page in value):
            raise ValueError("pages must be >= 0")
        return value


class DuplicateOperation(BaseModel):
    type: Literal["duplicate"]
    page: int = Field(ge=0)
    insert_after: int = Field(ge=-1)


OperationModel = Union[ReorderOperation, RotateOperation, DeleteOperation, DuplicateOperation]


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
            "type": "edit",
        }
    return job_id


def _update_job(job_id: str, **updates: Any) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(updates)


@edit_bp.post("/execute")
@limiter.limit("20/minute")
def execute_edit():
    """
    Start async edit job.
    Body: {"file_id": "...", "operations": [...]}
    """
    payload = request.get_json(silent=True) or {}
    file_id = payload.get("file_id")
    operations_raw = payload.get("operations")

    if not isinstance(file_id, str) or not file_id.strip():
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "file_id is required.",
            http_status=400,
        )

    if not isinstance(operations_raw, list) or not operations_raw:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "operations must be a non-empty list.",
            http_status=400,
        )

    validated_operations: list[dict[str, Any]] = []
    model_map = {
        "reorder": ReorderOperation,
        "rotate": RotateOperation,
        "delete": DeleteOperation,
        "duplicate": DuplicateOperation,
    }

    try:
        for item in operations_raw:
            if not isinstance(item, dict) or "type" not in item:
                raise ValueError("Each operation must be an object with a type field.")

            op_type = item["type"]
            model_cls = model_map.get(op_type)
            if model_cls is None:
                raise ValueError(f"Unsupported operation type: {op_type}")

            validated = model_cls.model_validate(item)
            validated_operations.append(validated.model_dump())
    except (ValidationError, ValueError) as exc:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "Invalid operation payload.",
            details=str(exc),
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

    def _worker(app, worker_job_id: str, worker_pdf_path: Path, worker_operations: list[dict[str, Any]]) -> None:
        with app.app_context():
            try:
                _update_job(worker_job_id, status="running", progress=10)
                service = EditService()
                output_path = service.apply_operations(worker_pdf_path, worker_operations)

                _update_job(
                    worker_job_id,
                    status="success",
                    progress=100,
                    result_path=str(output_path),
                )
                logger.info("edit.job_success", job_id=worker_job_id, output=str(output_path))
            except Exception as exc:
                logger.exception("edit.job_failed", job_id=worker_job_id, error=str(exc))
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
        args=(current_app._get_current_object(), job_id, pdf_path, validated_operations),
        daemon=True,
    )
    thread.start()

    return success_response(
        {
            "job_id": job_id,
            "status_url": f"/api/v1/jobs/{job_id}/status",
        }
    )