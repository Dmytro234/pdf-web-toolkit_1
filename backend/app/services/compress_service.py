from __future__ import annotations

import shutil
import subprocess
import uuid
from pathlib import Path

import fitz
import structlog
from flask import current_app
from PIL import Image

logger = structlog.get_logger(__name__)


class CompressService:
    """
    PDF compression service using PyMuPDF and Ghostscript fallback strategy.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def compress(
        self,
        pdf_path: str | Path,
        level: str,
        optimize_images: bool,
        image_quality: int,
        remove_metadata: bool,
    ) -> Path:
        """
        Compress PDF and return output path.
        """
        pdf_path = Path(pdf_path)
        level = level.lower().strip()
        if level not in {"low", "medium", "high", "extreme"}:
            raise ValueError("Invalid compression level.")

        job_dir = self.jobs_dir / uuid.uuid4().hex
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / f"{pdf_path.stem}_compressed.pdf"

        if level == "low":
            self._compress_with_pymupdf(
                pdf_path,
                output_path,
                {
                    "mode": "low",
                    "optimize_images": optimize_images,
                    "image_quality": image_quality,
                    "remove_metadata": remove_metadata,
                },
            )
            return output_path

        if level == "medium":
            self._compress_with_pymupdf(
                pdf_path,
                output_path,
                {
                    "mode": "medium",
                    "optimize_images": optimize_images,
                    "image_quality": image_quality,
                    "remove_metadata": remove_metadata,
                },
            )
            return output_path

        gs_settings = "/screen" if level == "high" else "/ebook"
        ghostscript_available = shutil.which("gs") or shutil.which("gswin64c") or shutil.which("gswin32c")

        if ghostscript_available:
            try:
                self._compress_with_ghostscript(pdf_path, output_path, gs_settings)
                if remove_metadata:
                    self._strip_metadata_inplace(output_path)
                logger.info("compress.ghostscript_success", level=level, output=str(output_path))
                return output_path
            except Exception as exc:
                logger.warning(
                    "compress.ghostscript_fallback",
                    level=level,
                    error=str(exc),
                )

        fallback_mode = "medium" if level == "high" else "extreme"
        self._compress_with_pymupdf(
            pdf_path,
            output_path,
            {
                "mode": fallback_mode,
                "optimize_images": True,
                "image_quality": image_quality,
                "remove_metadata": remove_metadata,
            },
        )
        return output_path

    def _compress_with_ghostscript(self, input_path: str | Path, output_path: str | Path, settings: str) -> None:
        """
        Compress PDF with Ghostscript.
        """
        executable = shutil.which("gs") or shutil.which("gswin64c") or shutil.which("gswin32c")
        if not executable:
            raise RuntimeError("Ghostscript is not available.")

        cmd = [
            executable,
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            f"-dPDFSETTINGS={settings}",
            f"-sOutputFile={str(output_path)}",
            str(input_path),
        ]

        logger.info("compress.ghostscript_start", command=cmd)
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)

        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "Ghostscript compression failed.")

    def _compress_with_pymupdf(
        self,
        input_path: str | Path,
        output_path: str | Path,
        options: dict,
    ) -> None:
        """
        Compress PDF with PyMuPDF.
        """
        input_path = Path(input_path)
        output_path = Path(output_path)
        mode = str(options.get("mode", "low"))
        optimize_images = bool(options.get("optimize_images", False))
        image_quality = int(options.get("image_quality", 70))
        remove_metadata = bool(options.get("remove_metadata", False))

        if mode == "low" and not optimize_images:
            with fitz.open(str(input_path)) as doc:
                if remove_metadata:
                    doc.set_metadata({})
                doc.save(
                    str(output_path),
                    garbage=4,
                    clean=True,
                    deflate=True,
                    deflate_images=True,
                    deflate_fonts=True,
                )
            return

        dpi = 96 if mode == "medium" else 72
        jpeg_quality = max(20, min(image_quality, 95))
        if mode == "extreme":
            jpeg_quality = min(jpeg_quality, 50)

        with fitz.open(str(input_path)) as src_doc:
            out_doc = fitz.open()

            for page_index in range(src_doc.page_count):
                page = src_doc.load_page(page_index)
                pix = page.get_pixmap(dpi=dpi, alpha=False)

                image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                image_bytes = self._pil_to_jpeg_bytes(image, jpeg_quality)

                rect = fitz.Rect(0, 0, page.rect.width, page.rect.height)
                out_page = out_doc.new_page(width=rect.width, height=rect.height)
                out_page.insert_image(rect, stream=image_bytes)

            if not remove_metadata:
                try:
                    out_doc.set_metadata(src_doc.metadata or {})
                except Exception:
                    out_doc.set_metadata({})
            else:
                out_doc.set_metadata({})

            out_doc.save(
                str(output_path),
                garbage=4,
                clean=True,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
            )
            out_doc.close()

    def _strip_metadata_inplace(self, pdf_path: str | Path) -> None:
        """
        Strip metadata from already created PDF.
        """
        pdf_path = Path(pdf_path)
        tmp_path = pdf_path.with_name(f"{pdf_path.stem}_nometa.pdf")
        with fitz.open(str(pdf_path)) as doc:
            doc.set_metadata({})
            doc.save(
                str(tmp_path),
                garbage=4,
                clean=True,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
            )
        tmp_path.replace(pdf_path)

    def _pil_to_jpeg_bytes(self, image: Image.Image, quality: int) -> bytes:
        from io import BytesIO

        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
        return buffer.getvalue()