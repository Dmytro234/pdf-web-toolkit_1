from __future__ import annotations

import uuid
from pathlib import Path

import fitz
import structlog
from flask import current_app

logger = structlog.get_logger(__name__)


class EditService:
    """
    Service for sequential PDF page operations using PyMuPDF.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def apply_operations(self, pdf_path: str | Path, operations: list[dict]) -> Path:
        """
        Apply supported operations sequentially and return output path.
        """
        pdf_path = Path(pdf_path)
        job_dir = self.jobs_dir / uuid.uuid4().hex
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / f"{pdf_path.stem}_edited.pdf"

        try:
            doc = fitz.open(str(pdf_path))

            for operation in operations:
                op_type = str(operation["type"])

                if op_type == "reorder":
                    doc = self._reorder(doc, list(operation["order"]))
                elif op_type == "rotate":
                    doc = self._rotate(doc, int(operation["page"]), int(operation["degrees"]))
                elif op_type == "delete":
                    doc = self._delete(doc, list(operation["pages"]))
                elif op_type == "duplicate":
                    doc = self._duplicate(doc, int(operation["page"]), int(operation["insert_after"]))
                else:
                    raise ValueError(f"Unsupported operation type: {op_type}")

            doc.save(str(output_path), garbage=3, deflate=True, clean=True)
            doc.close()

            logger.info("edit.completed", output=str(output_path), operations=len(operations))
            return output_path
        except (
            fitz.FileDataError,
            fitz.EmptyFileError,
            fitz.FileNotFoundError,
            RuntimeError,
            ValueError,
            IndexError,
        ) as exc:
            logger.exception("edit.failed", path=str(pdf_path), error=str(exc))
            raise

    def _reorder(self, doc: fitz.Document, order: list[int]) -> fitz.Document:
        page_count = doc.page_count
        if len(order) != page_count:
            raise ValueError("Reorder list length must match page count.")
        if sorted(order) != list(range(page_count)):
            raise ValueError("Reorder list must be a permutation of all page indices.")

        new_doc = fitz.open()
        for page_index in order:
            new_doc.insert_pdf(doc, from_page=page_index, to_page=page_index)

        doc.close()
        return new_doc

    def _rotate(self, doc: fitz.Document, page_index: int, degrees: int) -> fitz.Document:
        if degrees not in {90, 180, 270}:
            raise ValueError("degrees must be one of 90, 180, 270.")
        if page_index < 0 or page_index >= doc.page_count:
            raise IndexError("page index out of range.")

        page = doc.load_page(page_index)
        page.set_rotation(degrees)
        return doc

    def _delete(self, doc: fitz.Document, pages: list[int]) -> fitz.Document:
        if not pages:
            return doc

        page_count = doc.page_count
        normalized = sorted(set(int(page) for page in pages), reverse=True)

        for page_index in normalized:
            if page_index < 0 or page_index >= page_count:
                raise IndexError("page index out of range.")
            doc.delete_page(page_index)

        return doc

    def _duplicate(self, doc: fitz.Document, page_index: int, insert_after: int) -> fitz.Document:
        if page_index < 0 or page_index >= doc.page_count:
            raise IndexError("page index out of range.")
        if insert_after < -1 or insert_after >= doc.page_count:
            raise IndexError("insert_after out of range.")

        new_doc = fitz.open()

        for index in range(doc.page_count):
            new_doc.insert_pdf(doc, from_page=index, to_page=index)
            if index == insert_after:
                new_doc.insert_pdf(doc, from_page=page_index, to_page=page_index)

        if insert_after == -1:
            # Insert duplicate before the first original page.
            front_doc = fitz.open()
            front_doc.insert_pdf(doc, from_page=page_index, to_page=page_index)
            front_doc.insert_pdf(new_doc)
            new_doc.close()
            doc.close()
            return front_doc

        doc.close()
        return new_doc