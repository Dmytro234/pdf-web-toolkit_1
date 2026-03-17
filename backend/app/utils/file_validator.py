from __future__ import annotations

import io
import mimetypes
from dataclasses import dataclass
from typing import Final

import fitz
import structlog
from flask import current_app
from werkzeug.datastructures import FileStorage

from app.utils.response_helpers import ErrorCode


logger = structlog.get_logger(__name__)

allowed_pdf_mime_types: Final[set[str]] = {
    "application/pdf",
    "application/octet-stream",
}

allowed_image_mime_types: Final[set[str]] = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/tiff",
    "image/bmp",
    "image/gif",
    "application/octet-stream",
}


@dataclass(slots=True)
class ValidationResult:
    is_valid: bool
    code: str | None = None
    message: str | None = None
    mime_type: str | None = None
    size_bytes: int | None = None
    page_count: int | None = None


def detect_mime_type(file_storage: FileStorage) -> str:
    content_type = (file_storage.content_type or "").strip().lower()

    if content_type:
        return content_type

    filename = file_storage.filename or ""
    guessed_mime_type, _encoding = mimetypes.guess_type(filename)

    if guessed_mime_type is None:
        return "application/octet-stream"

    return guessed_mime_type.lower()


def get_file_size_bytes(file_storage: FileStorage) -> int:
    stream = file_storage.stream
    current_position = stream.tell()

    try:
        stream.seek(0, io.SEEK_END)
        file_size_bytes = stream.tell()
        return int(file_size_bytes)
    finally:
        stream.seek(current_position)


def read_all_file_bytes(file_storage: FileStorage) -> bytes:
    stream = file_storage.stream
    current_position = stream.tell()

    try:
        stream.seek(0)
        return stream.read()
    finally:
        stream.seek(current_position)


def looks_like_pdf(file_bytes: bytes) -> bool:
    if not file_bytes:
        return False

    file_header = file_bytes[:16].lstrip()
    return file_header.startswith(b"%PDF")


def filename_has_pdf_extension(file_storage: FileStorage) -> bool:
    filename = (file_storage.filename or "").strip().lower()
    return filename.endswith(".pdf")


def validate_pdf(file_storage: FileStorage) -> ValidationResult:
    try:
        detected_mime_type = detect_mime_type(file_storage)
        file_size_bytes = get_file_size_bytes(file_storage)

        maximum_file_size_megabytes = int(
            current_app.config.get("MAX_FILE_SIZE_MB", 50)
        )
        maximum_file_size_bytes = maximum_file_size_megabytes * 1024 * 1024

        if file_size_bytes <= 0:
            return ValidationResult(
                is_valid=False,
                code=ErrorCode.INVALID_FILE_TYPE.value,
                message="Empty file",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

        if file_size_bytes > maximum_file_size_bytes:
            return ValidationResult(
                is_valid=False,
                code=ErrorCode.FILE_TOO_LARGE.value,
                message=f"File exceeds {maximum_file_size_megabytes} MB",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

        file_bytes = read_all_file_bytes(file_storage)

        if not looks_like_pdf(file_bytes):
            return ValidationResult(
                is_valid=False,
                code=ErrorCode.INVALID_FILE_TYPE.value,
                message="Uploaded file is not a valid PDF",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

        if (
            detected_mime_type not in allowed_pdf_mime_types
            and not filename_has_pdf_extension(file_storage)
        ):
            return ValidationResult(
                is_valid=False,
                code=ErrorCode.INVALID_FILE_TYPE.value,
                message=f"Invalid file type: {detected_mime_type}",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

        try:
            with fitz.open(stream=file_bytes, filetype="pdf") as document:
                if document.is_encrypted:
                    return ValidationResult(
                        is_valid=False,
                        code=ErrorCode.PDF_ENCRYPTED.value,
                        message="Encrypted PDF",
                        mime_type=detected_mime_type,
                        size_bytes=file_size_bytes,
                    )

                page_count = document.page_count

                if page_count < 1:
                    return ValidationResult(
                        is_valid=False,
                        code=ErrorCode.PDF_CORRUPTED.value,
                        message="PDF corrupted",
                        mime_type=detected_mime_type,
                        size_bytes=file_size_bytes,
                    )

                return ValidationResult(
                    is_valid=True,
                    mime_type="application/pdf",
                    size_bytes=file_size_bytes,
                    page_count=page_count,
                )

        except Exception as validation_error:
            logger.warning(
                "pdf_validation_failed",
                error=str(validation_error),
            )

            return ValidationResult(
                is_valid=False,
                code=ErrorCode.PDF_CORRUPTED.value,
                message="PDF corrupted",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

    except Exception as validation_exception:
        logger.exception(
            "pdf_validation_exception",
            error=str(validation_exception),
        )

        return ValidationResult(
            is_valid=False,
            code=ErrorCode.PROCESSING_FAILED.value,
            message="Validation failed",
        )


def validate_image(file_storage: FileStorage) -> ValidationResult:
    try:
        detected_mime_type = detect_mime_type(file_storage)
        file_size_bytes = get_file_size_bytes(file_storage)

        maximum_file_size_megabytes = int(
            current_app.config.get("MAX_FILE_SIZE_MB", 50)
        )
        maximum_file_size_bytes = maximum_file_size_megabytes * 1024 * 1024

        if file_size_bytes <= 0:
            return ValidationResult(
                is_valid=False,
                code=ErrorCode.INVALID_FILE_TYPE.value,
                message="Empty file",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

        if detected_mime_type not in allowed_image_mime_types:
            return ValidationResult(
                is_valid=False,
                code=ErrorCode.INVALID_FILE_TYPE.value,
                message=f"Invalid image type: {detected_mime_type}",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

        if file_size_bytes > maximum_file_size_bytes:
            return ValidationResult(
                is_valid=False,
                code=ErrorCode.FILE_TOO_LARGE.value,
                message=f"File exceeds {maximum_file_size_megabytes} MB",
                mime_type=detected_mime_type,
                size_bytes=file_size_bytes,
            )

        return ValidationResult(
            is_valid=True,
            mime_type=detected_mime_type,
            size_bytes=file_size_bytes,
        )

    except Exception as validation_exception:
        logger.exception(
            "image_validation_exception",
            error=str(validation_exception),
        )

        return ValidationResult(
            is_valid=False,
            code=ErrorCode.PROCESSING_FAILED.value,
            message="Validation failed",
        )
