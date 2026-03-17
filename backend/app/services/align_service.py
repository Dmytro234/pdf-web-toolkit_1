from __future__ import annotations

import uuid
from pathlib import Path
from typing import Literal

import fitz
import structlog
from flask import current_app

logger = structlog.get_logger(__name__)

OrientationType = Literal["portrait", "landscape"]
TargetSizeType = Literal["A4", "Letter"]


class AlignService:
    """
    Service for page auto-rotation and size normalization.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def align(
        self,
        pdf_path: str | Path,
        auto_rotate: bool,
        normalize_size: bool,
        target_size: str,
        orientation: str,
    ) -> Path:
        """
        Align PDF pages by optional auto-rotation and optional normalization
        to a target page size.

        Args:
            pdf_path: Source PDF path.
            auto_rotate: Rotate pages based on desired orientation.
            normalize_size: Rebuild pages into uniform target size.
            target_size: "A4" or "Letter".
            orientation: "portrait" or "landscape".

        Returns:
            Path to generated PDF.
        """
        pdf_path = Path(pdf_path)
        target_size_normalized = target_size.strip()
        orientation_normalized = orientation.strip().lower()

        if target_size_normalized not in {"A4", "Letter"}:
            raise ValueError("target_size must be 'A4' or 'Letter'")
        if orientation_normalized not in {"portrait", "landscape"}:
            raise ValueError("orientation must be 'portrait' or 'landscape'")

        job_id = uuid.uuid4().hex
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / f"{pdf_path.stem}_aligned.pdf"

        try:
            if normalize_size:
                with fitz.open(str(pdf_path)) as src_doc, fitz.open() as out_doc:
                    base_rect = self._get_page_size(target_size_normalized)  # portrait rect
                    target_rect = self._rect_for_orientation(base_rect, orientation_normalized)

                    for page_index in range(src_doc.page_count):
                        src_page = src_doc.load_page(page_index)

                        if auto_rotate:
                            self._rotate_page_to_orientation(src_page, orientation_normalized)

                        src_page = src_doc.load_page(page_index)
                        src_rect = src_page.rect
                        dst_page = out_doc.new_page(width=target_rect.width, height=target_rect.height)

                        scale = min(
                            target_rect.width / src_rect.width,
                            target_rect.height / src_rect.height,
                        )
                        new_width = src_rect.width * scale
                        new_height = src_rect.height * scale

                        x0 = (target_rect.width - new_width) / 2
                        y0 = (target_rect.height - new_height) / 2
                        target_box = fitz.Rect(x0, y0, x0 + new_width, y0 + new_height)

                        dst_page.show_pdf_page(target_box, src_doc, page_index)

                    out_doc.save(
                        str(output_path),
                        garbage=3,
                        deflate=True,
                        clean=True,
                    )
            else:
                with fitz.open(str(pdf_path)) as doc:
                    if auto_rotate:
                        for page_index in range(doc.page_count):
                            page = doc.load_page(page_index)
                            self._rotate_page_to_orientation(page, orientation_normalized)

                    doc.save(
                        str(output_path),
                        garbage=3,
                        deflate=True,
                        clean=True,
                    )

            logger.info(
                "align.completed",
                input=str(pdf_path),
                output=str(output_path),
                auto_rotate=auto_rotate,
                normalize_size=normalize_size,
                target_size=target_size_normalized,
                orientation=orientation_normalized,
            )
            return output_path
        except (
            fitz.FileDataError,
            fitz.EmptyFileError,
            fitz.FileNotFoundError,
            RuntimeError,
            ValueError,
        ) as exc:
            logger.exception(
                "align.failed",
                input=str(pdf_path),
                auto_rotate=auto_rotate,
                normalize_size=normalize_size,
                target_size=target_size,
                orientation=orientation,
                error=str(exc),
            )
            raise

    def _detect_orientation(self, page: fitz.Page) -> OrientationType:
        """
        Detect current page orientation.
        """
        rect = page.rect
        return "landscape" if rect.width > rect.height else "portrait"

    def _get_page_size(self, target: TargetSizeType) -> fitz.Rect:
        """
        Return portrait page rect for target paper size.
        """
        if target == "A4":
            return fitz.Rect(0, 0, 595, 842)
        if target == "Letter":
            return fitz.Rect(0, 0, 612, 792)
        raise ValueError(f"Unsupported target size: {target}")

    def _rotate_to_portrait(self, page: fitz.Page) -> None:
        """
        Rotate a page to portrait orientation if necessary.
        """
        if self._detect_orientation(page) == "landscape":
            current_rotation = page.rotation
            page.set_rotation((current_rotation + 90) % 360)

    def _rotate_page_to_orientation(self, page: fitz.Page, orientation: str) -> None:
        current = self._detect_orientation(page)
        if orientation == "portrait" and current == "landscape":
            current_rotation = page.rotation
            page.set_rotation((current_rotation + 90) % 360)
        elif orientation == "landscape" and current == "portrait":
            current_rotation = page.rotation
            page.set_rotation((current_rotation + 90) % 360)

    def _rect_for_orientation(self, rect: fitz.Rect, orientation: str) -> fitz.Rect:
        if orientation == "portrait":
            return fitz.Rect(0, 0, min(rect.width, rect.height), max(rect.width, rect.height))
        if orientation == "landscape":
            return fitz.Rect(0, 0, max(rect.width, rect.height), min(rect.width, rect.height))
        raise ValueError(f"Unsupported orientation: {orientation}")