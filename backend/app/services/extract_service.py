from __future__ import annotations

import uuid
from pathlib import Path

import fitz
import structlog
from flask import current_app

logger = structlog.get_logger(__name__)


class ExtractService:
    """
    Service for extracting selected pages from a PDF.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def extract_pages(self, pdf_path: str | Path, pages: list[int]) -> Path:
        """
        Extract selected 0-based pages into a new PDF.

        Args:
            pdf_path: Source PDF path.
            pages: 0-based page indices to extract.

        Returns:
            Path to the generated PDF.
        """
        pdf_path = Path(pdf_path)
        if not pages:
            raise ValueError("pages must not be empty")

        job_id = uuid.uuid4().hex
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / f"{pdf_path.stem}_extracted.pdf"

        try:
            with fitz.open(str(pdf_path)) as src_doc:
                total_pages = src_doc.page_count
                normalized_pages = []
                seen: set[int] = set()

                for page_index in pages:
                    if not isinstance(page_index, int):
                        raise ValueError("All page indices must be integers.")
                    if page_index < 0 or page_index >= total_pages:
                        raise IndexError(f"Page index out of range: {page_index}")
                    if page_index not in seen:
                        normalized_pages.append(page_index)
                        seen.add(page_index)

                with fitz.open() as out_doc:
                    for page_index in normalized_pages:
                        out_doc.insert_pdf(src_doc, from_page=page_index, to_page=page_index)

                    out_doc.save(
                        str(output_path),
                        garbage=3,
                        deflate=True,
                        clean=True,
                    )

            logger.info(
                "extract.completed",
                input=str(pdf_path),
                output=str(output_path),
                pages=normalized_pages,
            )
            return output_path
        except (
            fitz.FileDataError,
            fitz.EmptyFileError,
            fitz.FileNotFoundError,
            RuntimeError,
            ValueError,
            IndexError,
        ) as exc:
            logger.exception(
                "extract.failed",
                input=str(pdf_path),
                pages=pages,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            raise