from __future__ import annotations

import uuid
from pathlib import Path
from typing import Literal

import fitz
import structlog
from flask import current_app

logger = structlog.get_logger(__name__)

UnitType = Literal["pt", "mm", "px"]


class CropService:
    """
    Service for cropping PDF pages by margins.
    """

    MM_TO_PT = 2.835
    PX_TO_PT = 0.75

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def crop_pages(
        self,
        pdf_path: str | Path,
        margins: dict,
        pages: list[int] | str,
        unit: UnitType,
    ) -> Path:
        """
        Crop selected pages using margin values.

        Args:
            pdf_path: Source PDF path.
            margins: Dict with top/right/bottom/left.
            pages: List of 0-based page indices or "all".
            unit: "pt", "mm", or "px".

        Returns:
            Path to cropped PDF.
        """
        pdf_path = Path(pdf_path)
        job_id = uuid.uuid4().hex
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / f"{pdf_path.stem}_cropped.pdf"

        try:
            top = self._to_points(float(margins.get("top", 0)), unit)
            right = self._to_points(float(margins.get("right", 0)), unit)
            bottom = self._to_points(float(margins.get("bottom", 0)), unit)
            left = self._to_points(float(margins.get("left", 0)), unit)

            with fitz.open(str(pdf_path)) as doc:
                total_pages = doc.page_count

                if pages == "all":
                    target_pages = list(range(total_pages))
                else:
                    if not isinstance(pages, list) or not pages:
                        raise ValueError("pages must be a non-empty list or 'all'")
                    target_pages = []
                    for page_index in pages:
                        if not isinstance(page_index, int):
                            raise ValueError("All page indices must be integers.")
                        if page_index < 0 or page_index >= total_pages:
                            raise IndexError(f"Page index out of range: {page_index}")
                        target_pages.append(page_index)

                for page_index in target_pages:
                    page = doc.load_page(page_index)
                    rect = page.rect

                    new_rect = fitz.Rect(
                        rect.x0 + left,
                        rect.y0 + top,
                        rect.x1 - right,
                        rect.y1 - bottom,
                    )

                    if new_rect.width <= 0 or new_rect.height <= 0:
                        raise ValueError(f"Crop margins too large for page {page_index}")

                    page.set_cropbox(new_rect)

                doc.save(
                    str(output_path),
                    garbage=3,
                    deflate=True,
                    clean=True,
                )

            logger.info(
                "crop.completed",
                input=str(pdf_path),
                output=str(output_path),
                pages=target_pages if pages != "all" else "all",
                margins={"top": top, "right": right, "bottom": bottom, "left": left},
                unit=unit,
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
                "crop.failed",
                input=str(pdf_path),
                margins=margins,
                pages=pages,
                unit=unit,
                error=str(exc),
            )
            raise

    def _to_points(self, value: float, unit: UnitType) -> float:
        if value < 0:
            raise ValueError("Margin values must be non-negative.")
        if unit == "pt":
            return value
        if unit == "mm":
            return value * self.MM_TO_PT
        if unit == "px":
            return value * self.PX_TO_PT
        raise ValueError(f"Unsupported unit: {unit}")