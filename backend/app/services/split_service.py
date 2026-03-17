from __future__ import annotations

import uuid
import zipfile
from pathlib import Path

import fitz
import structlog
from flask import current_app

logger = structlog.get_logger(__name__)


class SplitService:
    """
    Service for splitting PDF files in multiple ways.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def split_by_pages(self, pdf_path: str | Path, pages_per_chunk: int) -> list[Path]:
        """
        Split PDF into chunks with fixed number of pages.
        """
        if pages_per_chunk <= 0:
            raise ValueError("pages_per_chunk must be > 0")

        pdf_path = Path(pdf_path)
        output_paths: list[Path] = []
        job_dir = self.jobs_dir / uuid.uuid4().hex
        job_dir.mkdir(parents=True, exist_ok=True)

        try:
            with fitz.open(str(pdf_path)) as doc:
                total_pages = doc.page_count
                chunk_index = 1

                for start in range(0, total_pages, pages_per_chunk):
                    end = min(start + pages_per_chunk - 1, total_pages - 1)
                    chunk_doc = fitz.open()
                    chunk_doc.insert_pdf(doc, from_page=start, to_page=end)

                    out_path = job_dir / f"{pdf_path.stem}_part_{chunk_index}.pdf"
                    chunk_doc.save(str(out_path), garbage=3, deflate=True, clean=True)
                    chunk_doc.close()

                    output_paths.append(out_path)
                    chunk_index += 1

            return output_paths
        except (
            fitz.FileDataError,
            fitz.EmptyFileError,
            fitz.FileNotFoundError,
            RuntimeError,
            ValueError,
        ) as exc:
            logger.exception("split.by_pages_failed", path=str(pdf_path), error=str(exc))
            raise

    def split_by_size(self, pdf_path: str | Path, max_size_mb: int) -> list[Path]:
        """
        Split PDF into chunks attempting to keep each file within max_size_mb.
        """
        if max_size_mb <= 0:
            raise ValueError("max_size_mb must be > 0")

        pdf_path = Path(pdf_path)
        max_size_bytes = max_size_mb * 1024 * 1024
        output_paths: list[Path] = []
        job_dir = self.jobs_dir / uuid.uuid4().hex
        job_dir.mkdir(parents=True, exist_ok=True)

        try:
            with fitz.open(str(pdf_path)) as doc:
                total_pages = doc.page_count
                start_page = 0
                part_index = 1

                while start_page < total_pages:
                    candidate_end = start_page
                    last_good_end = start_page

                    while candidate_end < total_pages:
                        test_doc = fitz.open()
                        test_doc.insert_pdf(doc, from_page=start_page, to_page=candidate_end)
                        test_path = job_dir / f".tmp_test_{part_index}.pdf"
                        test_doc.save(str(test_path), garbage=3, deflate=True, clean=True)
                        test_doc.close()

                        current_size = test_path.stat().st_size
                        test_path.unlink(missing_ok=True)

                        if current_size <= max_size_bytes:
                            last_good_end = candidate_end
                            candidate_end += 1
                        else:
                            break

                    if last_good_end < start_page:
                        # Even one page exceeds the size cap, emit it anyway.
                        last_good_end = start_page

                    final_doc = fitz.open()
                    final_doc.insert_pdf(doc, from_page=start_page, to_page=last_good_end)
                    out_path = job_dir / f"{pdf_path.stem}_size_part_{part_index}.pdf"
                    final_doc.save(str(out_path), garbage=3, deflate=True, clean=True)
                    final_doc.close()

                    output_paths.append(out_path)
                    part_index += 1
                    start_page = last_good_end + 1

            return output_paths
        except (
            fitz.FileDataError,
            fitz.EmptyFileError,
            fitz.FileNotFoundError,
            RuntimeError,
            ValueError,
        ) as exc:
            logger.exception("split.by_size_failed", path=str(pdf_path), error=str(exc))
            raise

    def split_each_page(self, pdf_path: str | Path) -> list[Path]:
        """
        Split PDF into one file per page.
        """
        return self.split_by_pages(pdf_path, 1)

    def split_by_ranges(self, pdf_path: str | Path, ranges: list[str]) -> list[Path]:
        """
        Split PDF by 1-based ranges such as ['1-3', '4-7', '8'].
        """
        if not ranges:
            raise ValueError("ranges must not be empty")

        pdf_path = Path(pdf_path)
        output_paths: list[Path] = []
        job_dir = self.jobs_dir / uuid.uuid4().hex
        job_dir.mkdir(parents=True, exist_ok=True)

        try:
            with fitz.open(str(pdf_path)) as doc:
                total_pages = doc.page_count

                for index, item in enumerate(ranges, start=1):
                    start_page, end_page = self._parse_range(item, total_pages)
                    chunk_doc = fitz.open()
                    chunk_doc.insert_pdf(doc, from_page=start_page, to_page=end_page)

                    out_path = job_dir / f"{pdf_path.stem}_range_{index}.pdf"
                    chunk_doc.save(str(out_path), garbage=3, deflate=True, clean=True)
                    chunk_doc.close()
                    output_paths.append(out_path)

            return output_paths
        except (
            fitz.FileDataError,
            fitz.EmptyFileError,
            fitz.FileNotFoundError,
            RuntimeError,
            ValueError,
        ) as exc:
            logger.exception("split.by_ranges_failed", path=str(pdf_path), error=str(exc))
            raise

    def _create_zip(self, file_paths: list[Path]) -> Path:
        """
        Create ZIP archive from provided file paths.
        """
        if not file_paths:
            raise ValueError("No file paths to zip.")

        job_dir = file_paths[0].parent
        zip_path = job_dir / "split_result.zip"

        with zipfile.ZipFile(str(zip_path), "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in file_paths:
                archive.write(file_path, arcname=file_path.name)

        logger.info("split.zip_created", path=str(zip_path), files=len(file_paths))
        return zip_path

    def _parse_range(self, raw_range: str, total_pages: int) -> tuple[int, int]:
        value = raw_range.strip()
        if not value:
            raise ValueError("Empty range value")

        if "-" in value:
            start_raw, end_raw = value.split("-", 1)
            start = int(start_raw)
            end = int(end_raw)
        else:
            start = int(value)
            end = int(value)

        if start < 1 or end < 1 or start > end or end > total_pages:
            raise ValueError(f"Invalid range: {raw_range}")

        return start - 1, end - 1