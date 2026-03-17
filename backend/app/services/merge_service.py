from __future__ import annotations

import json
import uuid
from pathlib import Path

import fitz
import structlog
from flask import current_app

logger = structlog.get_logger(__name__)


class MergeService:
    """
    Service for merging multiple PDF files using PyMuPDF.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def merge(self, file_paths: list[Path], order: list[int]) -> Path:
        """
        Merge PDF files in the given order and return output path.

        Preserves bookmarks when possible and writes a sidecar JSON with
        merge metadata (page counts, bookmarks count, source files).
        """
        if not file_paths:
            raise ValueError("No file paths provided.")
        if len(order) != len(file_paths):
            raise ValueError("Order length must match file_paths length.")
        if sorted(order) != list(range(len(file_paths))):
            raise ValueError("Order must be a permutation of file indices.")

        job_id = uuid.uuid4().hex
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / "merged.pdf"
        metadata_path = job_dir / "merged.meta.json"

        merged_doc = fitz.open()
        merged_toc: list[list[int | str]] = []
        source_stats: list[dict[str, int | str]] = []

        page_offset = 0

        try:
            ordered_paths = [file_paths[index] for index in order]

            for source_path in ordered_paths:
                logger.info("merge.source_open", path=str(source_path))
                with fitz.open(str(source_path)) as src_doc:
                    page_count = src_doc.page_count

                    src_toc = src_doc.get_toc(simple=True)
                    adjusted_toc: list[list[int | str]] = []
                    for item in src_toc:
                        if len(item) >= 3:
                            level, title, page_num = item[0], item[1], item[2]
                            adjusted_toc.append([level, title, int(page_num) + page_offset])

                    merged_doc.insert_pdf(src_doc)
                    merged_toc.extend(adjusted_toc)

                    source_stats.append(
                        {
                            "file": source_path.name,
                            "pages": page_count,
                            "bookmarks": len(src_toc),
                        }
                    )
                    page_offset += page_count

            if merged_toc:
                merged_doc.set_toc(merged_toc)

            merged_doc.save(
                str(output_path),
                garbage=3,
                deflate=True,
                clean=True,
            )

            merge_metadata = {
                "total_pages": merged_doc.page_count,
                "total_bookmarks": len(merged_toc),
                "sources": source_stats,
                "order": order,
                "output_file": output_path.name,
            }
            metadata_path.write_text(
                json.dumps(merge_metadata, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            logger.info(
                "merge.completed",
                output=str(output_path),
                total_pages=merged_doc.page_count,
                total_bookmarks=len(merged_toc),
            )
            return output_path
        except (
            fitz.FileDataError,
            fitz.EmptyFileError,
            fitz.FileNotFoundError,
            RuntimeError,
            ValueError,
        ) as exc:
            logger.exception("merge.failed", error=str(exc))
            raise
        finally:
            merged_doc.close()