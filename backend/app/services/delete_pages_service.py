from __future__ import annotations

import uuid
from pathlib import Path

import fitz
import structlog
from flask import current_app

logger = structlog.get_logger(__name__)


class DeletePagesService:
    """
    Service for deleting selected pages from a PDF.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def delete_pages(self, pdf_path: str | Path, pages_to_delete: list[int]) -> Path:
        """
        Delete selected 0-based pages and return a new PDF.

        Args:
            pdf_path: Source PDF path.
            pages_to_delete: 0-based page indices to remove.

        Returns:
            Path to the generated PDF.
        """
        pdf_path = Path(pdf_path)
        if not pages_to_delete:
            raise ValueError("pages_to_delete must not be empty")

        job_id = uuid.uuid4().hex
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / f"{pdf_path.stem}_pages_deleted.pdf"

        try:
            with fitz.open(str(pdf_path)) as src_doc:
                total_pages = src_doc.page_count
                pages_set = set()

                for page_index in pages_to_delete:
                    if not isinstance(page_index, int):
                        raise ValueError("All page indices must be integers.")
                    if page_index < 0 or page_index >= total_pages:
                        raise IndexError(f"Page index out of range: {page_index}")
                    pages_set.add(page_index)

                if len(pages_set) >= total_pages:
                    raise ValueError("Cannot delete all pages from the PDF.")

                with fitz.open() as out_doc:
                    for page_index in range(total_pages):
                        if page_index not in pages_set:
                            out_doc.insert_pdf(src_doc, from_page=page_index, to_page=page_index)

                    out_doc.save(
                        str(output_path),
                        garbage=3,
                        deflate=True,
                        clean=True,
                    )

            logger.info(
                "delete_pages.completed",
                input=str(pdf_path),
                output=str(output_path),
                deleted_pages=sorted(pages_set),
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
                "delete_pages.failed",
                input=str(pdf_path),
                pages_to_delete=pages_to_delete,
                error=str(exc),
                error_type=type(exc).__name__,
            )
            raise