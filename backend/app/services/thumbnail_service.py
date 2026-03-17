from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fitz
import structlog

logger = structlog.get_logger(__name__)

_THUMBNAIL_EXECUTOR = ThreadPoolExecutor(max_workers=4)


def _render_thumbnail(
    pdf_path: str | Path,
    page_num: int,
    size: tuple[int, int],
) -> bytes:
    pdf_path = str(pdf_path)

    try:
        with fitz.open(pdf_path) as doc:
            if doc.is_encrypted:
                raise ValueError("Encrypted PDF cannot be thumbnailed.")

            if page_num < 0 or page_num >= doc.page_count:
                raise IndexError(f"Page {page_num} is out of range.")

            page = doc.load_page(page_num)
            rect = page.rect
            if rect.width <= 0 or rect.height <= 0:
                raise ValueError("Invalid page dimensions.")

            target_w, target_h = size
            zoom_x = target_w / rect.width
            zoom_y = target_h / rect.height
            zoom = min(zoom_x, zoom_y)

            matrix = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            return pix.tobytes("png")
    except (
        fitz.FileDataError,
        fitz.EmptyFileError,
        fitz.FileNotFoundError,
        RuntimeError,
        ValueError,
        IndexError,
    ) as exc:
        logger.exception(
            "thumbnail.render_failed",
            pdf_path=pdf_path,
            page_num=page_num,
            error=str(exc),
            error_type=type(exc).__name__,
        )
        raise


def generate_thumbnail(
    pdf_path: str | Path,
    page_num: int,
    size: tuple[int, int] = (150, 200),
    cache_path: str | Path | None = None,
) -> bytes:
    """
    Generate PNG thumbnail for a single page using PyMuPDF.
    Optionally cache the result on disk.
    """
    cache_file = Path(cache_path) if cache_path is not None else None
    if cache_file is not None and cache_file.exists():
        return cache_file.read_bytes()

    future = _THUMBNAIL_EXECUTOR.submit(
        _render_thumbnail,
        pdf_path,
        page_num,
        size,
    )
    png_bytes = future.result()

    if cache_file is not None:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_bytes(png_bytes)

    logger.info(
        "thumbnail.generated",
        pdf_path=str(pdf_path),
        page_num=page_num,
        cached=cache_file is not None,
    )
    return png_bytes


def generate_all_thumbnails(
    pdf_path: str | Path,
) -> list[bytes]:
    """
    Generate PNG thumbnails for all pages in a PDF.
    """
    pdf_path = Path(pdf_path)
    try:
        with fitz.open(str(pdf_path)) as doc:
            if doc.is_encrypted:
                raise ValueError("Encrypted PDF cannot be thumbnailed.")

            page_count = doc.page_count
    except (
        fitz.FileDataError,
        fitz.EmptyFileError,
        fitz.FileNotFoundError,
        RuntimeError,
        ValueError,
    ) as exc:
        logger.exception(
            "thumbnail.generate_all_failed_open",
            pdf_path=str(pdf_path),
            error=str(exc),
            error_type=type(exc).__name__,
        )
        raise

    futures = [
        _THUMBNAIL_EXECUTOR.submit(
            generate_thumbnail,
            pdf_path,
            page_index,
            (150, 200),
            None,
        )
        for page_index in range(page_count)
    ]
    results = [future.result() for future in futures]

    logger.info(
        "thumbnail.generated_all",
        pdf_path=str(pdf_path),
        page_count=page_count,
    )
    return results
