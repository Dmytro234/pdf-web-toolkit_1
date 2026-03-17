from __future__ import annotations

from enum import Enum
from typing import Any

from flask import jsonify


class ErrorCode(str, Enum):
    INVALID_FILE_TYPE = "INVALID_FILE_TYPE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    SESSION_QUOTA_EXCEEDED = "SESSION_QUOTA_EXCEEDED"
    PDF_CORRUPTED = "PDF_CORRUPTED"
    PDF_ENCRYPTED = "PDF_ENCRYPTED"
    PROCESSING_FAILED = "PROCESSING_FAILED"
    JOB_NOT_FOUND = "JOB_NOT_FOUND"
    JOB_EXPIRED = "JOB_EXPIRED"


def success_response(
    data: Any,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Create standard success response payload.
    """
    payload: dict[str, Any] = {
        "ok": True,
        "data": data,
    }
    if meta is not None:
        payload["meta"] = meta
    return payload


def error_response(
    code: ErrorCode | str,
    message: str,
    details: Any = None,
    http_status: int = 400,
):
    """
    Create standard error response payload as Flask response object.
    """
    payload: dict[str, Any] = {
        "ok": False,
        "error": {
            "code": str(code),
            "message": message,
        },
    }
    if details is not None:
        payload["error"]["details"] = details
    return jsonify(payload), http_status


def job_response(
    job_id: str,
    status: str,
    progress: int,
    result_url: str | None = None,
) -> dict[str, Any]:
    """
    Create standard job status response payload.
    """
    data: dict[str, Any] = {
        "job_id": job_id,
        "status": status,
        "progress": progress,
    }
    if result_url is not None:
        data["result_url"] = result_url

    return {
        "ok": True,
        "data": data,
    }
