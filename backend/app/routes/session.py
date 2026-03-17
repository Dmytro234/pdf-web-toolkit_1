from __future__ import annotations

import mimetypes
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from flask import Blueprint, Response, current_app, request, send_file, session

from app.services.thumbnail_service import generate_thumbnail
from app.utils.file_validator import validate_pdf
from app.utils.response_helpers import (
    ErrorCode,
    error_response,
    job_response,
    success_response,
)
from app.utils.session_manager import FileRecord, SessionManager


logger = structlog.get_logger(__name__)

session_bp = Blueprint("session", __name__, url_prefix="/api/v1")

thumbnail_executor = ThreadPoolExecutor(max_workers=4)
jobs_lock = threading.Lock()
jobs_registry: dict[str, dict[str, Any]] = {}


def ensure_session_id() -> str:
    session_id = session.get("session_id")

    if not session_id:
        session_id = uuid.uuid4().hex
        session["session_id"] = session_id
        session.permanent = False

    return str(session_id)


def create_job_record() -> str:
    job_id = uuid.uuid4().hex

    with jobs_lock:
        jobs_registry[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "progress": 0,
            "result_path": None,
            "created_at": datetime.now(UTC).isoformat(),
        }

    return job_id


def update_job_record(job_id: str, **updates: Any) -> None:
    with jobs_lock:
        if job_id in jobs_registry:
            jobs_registry[job_id].update(updates)


def get_job_record(job_id: str) -> dict[str, Any] | None:
    with jobs_lock:
        job_record = jobs_registry.get(job_id)
        return dict(job_record) if job_record else None


def delete_job_record(job_id: str) -> bool:
    with jobs_lock:
        removed_job = jobs_registry.pop(job_id, None)
        return removed_job is not None


def serialize_file_record(file_record: FileRecord) -> dict[str, Any]:
    serialized_data = asdict(file_record)
    serialized_data["download_name"] = Path(file_record.path).name
    return serialized_data


@session_bp.post("/session/upload")
def upload_files():
    session_id = ensure_session_id()
    session_manager = SessionManager()
    session_manager.create_session_dir(session_id)

    logger.info(
        "session.upload_request_received",
        session_id=session_id,
        content_type=request.content_type,
        mime_type=request.mimetype,
        content_length=request.content_length,
        request_file_keys=list(request.files.keys()),
        request_form_keys=list(request.form.keys()),
    )

    uploaded_files = request.files.getlist("files")

    logger.info(
        "session.upload_files_parsed",
        session_id=session_id,
        files_count=len(uploaded_files),
        filenames=[
            uploaded_file.filename
            for uploaded_file in uploaded_files
            if uploaded_file and uploaded_file.filename
        ],
    )

    if not uploaded_files:
        logger.warning(
            "session.upload_no_files",
            session_id=session_id,
            content_type=request.content_type,
            request_file_keys=list(request.files.keys()),
        )
        return error_response(
            ErrorCode.INVALID_FILE_TYPE,
            "No files provided.",
            details={
                "expected_field_name": "files",
                "received_file_keys": list(request.files.keys()),
                "content_type": request.content_type,
            },
            http_status=400,
        )

    stored_file_records: list[dict[str, Any]] = []

    for uploaded_file in uploaded_files:
        if not uploaded_file or not uploaded_file.filename:
            logger.warning(
                "session.upload_skipped_empty_file",
                session_id=session_id,
            )
            continue

        logger.info(
            "session.upload_validating_file",
            session_id=session_id,
            filename=uploaded_file.filename,
            content_type=uploaded_file.content_type,
        )

        validation_result = validate_pdf(uploaded_file)

        if not validation_result.is_valid:
            logger.warning(
                "session.upload_validation_failed",
                session_id=session_id,
                filename=uploaded_file.filename,
                code=validation_result.code,
                message=validation_result.message,
                mime_type=validation_result.mime_type,
                size_bytes=validation_result.size_bytes,
                page_count=validation_result.page_count,
            )
            return error_response(
                validation_result.code or ErrorCode.PROCESSING_FAILED,
                validation_result.message or "Invalid file.",
                details={
                    "filename": uploaded_file.filename,
                    "mime_type": validation_result.mime_type,
                    "size_bytes": validation_result.size_bytes,
                    "page_count": validation_result.page_count,
                },
                http_status=400,
            )

        current_session_size_bytes = session_manager.get_session_size(session_id)
        maximum_session_size_bytes = int(current_app.config["MAX_SESSION_SIZE_MB"]) * 1024 * 1024
        maximum_files_per_session = int(current_app.config["MAX_FILES_PER_SESSION"])
        current_files_count = len(session_manager.list_files(session_id))
        incoming_file_size_bytes = int(validation_result.size_bytes or 0)

        is_session_size_exceeded = (
            current_session_size_bytes + incoming_file_size_bytes > maximum_session_size_bytes
        )
        is_files_count_exceeded = current_files_count + 1 > maximum_files_per_session

        if is_session_size_exceeded or is_files_count_exceeded:
            logger.warning(
                "session.upload_quota_exceeded",
                session_id=session_id,
                current_session_size_bytes=current_session_size_bytes,
                incoming_file_size_bytes=incoming_file_size_bytes,
                maximum_session_size_bytes=maximum_session_size_bytes,
                current_files_count=current_files_count,
                maximum_files_per_session=maximum_files_per_session,
            )
            return error_response(
                ErrorCode.SESSION_QUOTA_EXCEEDED,
                "Session quota exceeded.",
                details={
                    "max_session_size_mb": current_app.config["MAX_SESSION_SIZE_MB"],
                    "max_files_per_session": current_app.config["MAX_FILES_PER_SESSION"],
                },
                http_status=400,
            )

        file_id = uuid.uuid4().hex
        original_filename = uploaded_file.filename
        stored_filename = f"{file_id}.pdf"
        target_file_path = session_manager.session_files_dir(session_id) / stored_filename

        uploaded_file.stream.seek(0)
        uploaded_file.save(target_file_path)

        file_record = session_manager.register_file(
            session_id=session_id,
            file_id=file_id,
            metadata={
                "original_name": original_filename,
                "path": str(target_file_path),
                "size": int(validation_result.size_bytes or target_file_path.stat().st_size),
                "page_count": validation_result.page_count,
                "mime_type": validation_result.mime_type or "application/pdf",
                "uploaded_at": datetime.now(UTC).isoformat(),
            },
        )

        stored_file_records.append(serialize_file_record(file_record))

        logger.info(
            "session.uploaded_file",
            session_id=session_id,
            file_id=file_id,
            filename=original_filename,
            size=file_record.size,
            page_count=file_record.page_count,
        )

    if not stored_file_records:
        logger.warning(
            "session.upload_no_valid_files_stored",
            session_id=session_id,
        )
        return error_response(
            ErrorCode.INVALID_FILE_TYPE,
            "No valid files were uploaded.",
            http_status=400,
        )

    return success_response(
        data={
            "session_id": session_id,
            "files": stored_file_records,
        },
        meta={
            "count": len(stored_file_records),
            "session_size_bytes": session_manager.get_session_size(session_id),
        },
    )


@session_bp.get("/session/files")
def list_session_files():
    session_id = ensure_session_id()
    session_manager = SessionManager()
    file_records = session_manager.list_files(session_id)

    return success_response(
        data=[serialize_file_record(file_record) for file_record in file_records],
        meta={
            "count": len(file_records),
            "session_size_bytes": session_manager.get_session_size(session_id),
        },
    )


@session_bp.delete("/session/files/<file_id>")
def delete_session_file(file_id: str):
    session_id = ensure_session_id()
    session_manager = SessionManager()

    was_deleted = session_manager.delete_file(session_id, file_id)

    if not was_deleted:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "File not found.",
            details={"file_id": file_id},
            http_status=404,
        )

    return success_response(
        data={
            "deleted": True,
            "file_id": file_id,
        },
        meta={
            "session_size_bytes": session_manager.get_session_size(session_id),
        },
    )


@session_bp.get("/session/thumbnail/<file_id>/<int:page>")
def get_thumbnail(file_id: str, page: int):
    session_id = ensure_session_id()
    session_manager = SessionManager()
    file_record = session_manager.get_file(session_id, file_id)

    if file_record is None:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "File not found.",
            details={"file_id": file_id},
            http_status=404,
        )

    if page < 0:
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "Page number must be non-negative.",
            details={"page": page},
            http_status=400,
        )

    try:
        thumbnail_directory = session_manager.session_thumbnail_dir(session_id, file_id)
        thumbnail_file_path = thumbnail_directory / f"page_{page}.png"

        if not thumbnail_file_path.exists():
            thumbnail_generation_future = thumbnail_executor.submit(
                generate_thumbnail,
                file_record.path,
                page,
                (150, 200),
                thumbnail_file_path,
            )
            thumbnail_bytes = thumbnail_generation_future.result()
        else:
            thumbnail_bytes = thumbnail_file_path.read_bytes()

        response = Response(thumbnail_bytes, mimetype="image/png")
        response.headers["Cache-Control"] = "public, max-age=86400"
        response.headers["ETag"] = (
            f'{file_id}-{page}-'
            f'{thumbnail_file_path.stat().st_mtime_ns if thumbnail_file_path.exists() else "generated"}'
        )
        return response

    except Exception as error:
        logger.exception(
            "session.thumbnail_failed",
            session_id=session_id,
            file_id=file_id,
            page=page,
            error=str(error),
        )
        return error_response(
            ErrorCode.PROCESSING_FAILED,
            "Failed to generate thumbnail.",
            details={
                "file_id": file_id,
                "page": page,
            },
            http_status=500,
        )


@session_bp.get("/jobs/<job_id>/status")
def get_job_status(job_id: str):
    job_record = get_job_record(job_id)

    if job_record is None:
        return error_response(
            ErrorCode.JOB_NOT_FOUND,
            "Job not found.",
            details={"job_id": job_id},
            http_status=404,
        )

    result_url = f"/api/v1/jobs/{job_id}/download" if job_record.get("result_path") else None

    return job_response(
        job_id=job_id,
        status=str(job_record["status"]),
        progress=int(job_record["progress"]),
        result_url=result_url,
    )


@session_bp.get("/jobs/<job_id>/download")
def download_job_result(job_id: str):
    job_record = get_job_record(job_id)

    if job_record is None:
        return error_response(
            ErrorCode.JOB_NOT_FOUND,
            "Job not found.",
            details={"job_id": job_id},
            http_status=404,
        )

    raw_result_path = job_record.get("result_path")

    if not raw_result_path:
        return error_response(
            ErrorCode.JOB_EXPIRED,
            "Job result not available.",
            details={"job_id": job_id},
            http_status=404,
        )

    result_file_path = Path(raw_result_path)

    if not result_file_path.exists():
        return error_response(
            ErrorCode.JOB_EXPIRED,
            "Job result file has expired or was removed.",
            details={"job_id": job_id},
            http_status=404,
        )

    mime_type, _encoding = mimetypes.guess_type(result_file_path.name)

    return send_file(
        result_file_path,
        mimetype=mime_type or "application/octet-stream",
        as_attachment=True,
        download_name=result_file_path.name,
        conditional=True,
    )


@session_bp.delete("/jobs/<job_id>")
def delete_job(job_id: str):
    job_record = get_job_record(job_id)

    if job_record is None:
        return error_response(
            ErrorCode.JOB_NOT_FOUND,
            "Job not found.",
            details={"job_id": job_id},
            http_status=404,
        )

    raw_result_path = job_record.get("result_path")

    if raw_result_path:
        result_file_path = Path(raw_result_path)

        try:
            if result_file_path.exists():
                result_file_path.unlink()
        except Exception as error:
            logger.warning(
                "job.result_delete_failed",
                job_id=job_id,
                path=str(result_file_path),
                error=str(error),
            )

    delete_job_record(job_id)

    return success_response(
        data={
            "deleted": True,
            "job_id": job_id,
        },
    )