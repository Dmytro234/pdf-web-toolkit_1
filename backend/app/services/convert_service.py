from __future__ import annotations

import shutil
import subprocess
import uuid
import zipfile
from pathlib import Path

import fitz
import structlog
from flask import current_app
from pdf2image import convert_from_path
from PIL import Image
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

logger = structlog.get_logger(__name__)


class ConvertService:
    """
    Service for converting PDFs, images, and DOCX files.
    """

    def __init__(self) -> None:
        temp_dir = Path(current_app.config["TEMP_DIR"]).resolve()
        self.jobs_dir = temp_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def pdf_to_images(
        self,
        pdf_path: str | Path,
        format: str,
        dpi: int,
        quality: int,
    ) -> Path:
        """
        Convert each PDF page to an image and return ZIP archive path.

        Args:
            pdf_path: Source PDF path.
            format: "jpg" or "png".
            dpi: Render DPI.
            quality: JPEG quality for jpg output.

        Returns:
            Path to ZIP archive with generated images.
        """
        pdf_path = Path(pdf_path)
        image_format = format.lower().strip()
        if image_format not in {"jpg", "png"}:
            raise ValueError("format must be 'jpg' or 'png'")
        if dpi <= 0:
            raise ValueError("dpi must be > 0")
        if quality < 1 or quality > 100:
            raise ValueError("quality must be between 1 and 100")

        job_id = uuid.uuid4().hex
        job_dir = self.jobs_dir / job_id
        images_dir = job_dir / "images"
        images_dir.mkdir(parents=True, exist_ok=True)

        try:
            pil_images = convert_from_path(
                pdf_path=str(pdf_path),
                dpi=dpi,
                fmt="jpeg" if image_format == "jpg" else "png",
            )

            generated_files: list[Path] = []
            for index, image in enumerate(pil_images, start=1):
                out_ext = "jpg" if image_format == "jpg" else "png"
                out_path = images_dir / f"{pdf_path.stem}_page_{index}.{out_ext}"

                if image_format == "jpg":
                    image = image.convert("RGB")
                    image.save(out_path, format="JPEG", quality=quality, optimize=True)
                else:
                    image.save(out_path, format="PNG", optimize=True)

                generated_files.append(out_path)

            zip_path = job_dir / f"{pdf_path.stem}_{image_format}.zip"
            self._create_zip(generated_files, zip_path)

            logger.info(
                "convert.pdf_to_images.completed",
                input=str(pdf_path),
                output=str(zip_path),
                pages=len(generated_files),
                format=image_format,
            )
            return zip_path
        except Exception as exc:
            logger.exception(
                "convert.pdf_to_images.failed",
                input=str(pdf_path),
                format=image_format,
                error=str(exc),
            )
            raise

    def images_to_pdf(self, image_paths: list[Path], output_path: str | Path) -> Path:
        """
        Convert multiple images to a single PDF, sorted by filename.

        Args:
            image_paths: Input image paths.
            output_path: Target PDF path.

        Returns:
            Path to generated PDF.
        """
        if not image_paths:
            raise ValueError("image_paths must not be empty")

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            sorted_paths = sorted(image_paths, key=lambda p: p.name.lower())

            images: list[Image.Image] = []
            for image_path in sorted_paths:
                img = Image.open(image_path)
                if img.mode != "RGB":
                    img = img.convert("RGB")
                images.append(img)

            first, rest = images[0], images[1:]
            first.save(output_path, save_all=True, append_images=rest, format="PDF")

            for image in images:
                try:
                    image.close()
                except Exception:
                    pass

            logger.info(
                "convert.images_to_pdf.completed",
                output=str(output_path),
                files=[str(path) for path in sorted_paths],
            )
            return output_path
        except Exception as exc:
            logger.exception(
                "convert.images_to_pdf.failed",
                output=str(output_path),
                error=str(exc),
            )
            raise

    def docx_to_pdf(self, docx_path: str | Path) -> Path:
        """
        Convert DOCX to PDF.

        Attempt 1:
            LibreOffice CLI
        Attempt 2:
            Fallback via python-docx + reportlab

        Args:
            docx_path: Source DOCX path.

        Returns:
            Path to generated PDF.
        """
        docx_path = Path(docx_path)
        job_id = uuid.uuid4().hex
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)
        output_path = job_dir / f"{docx_path.stem}.pdf"

        try:
            self._docx_to_pdf_libreoffice(docx_path, output_path)
            logger.info(
                "convert.docx_to_pdf.libreoffice_success",
                input=str(docx_path),
                output=str(output_path),
            )
            return output_path
        except Exception as libreoffice_exc:
            logger.warning(
                "convert.docx_to_pdf.libreoffice_failed",
                input=str(docx_path),
                error=str(libreoffice_exc),
            )

        try:
            self._docx_to_pdf_fallback(docx_path, output_path)
            logger.info(
                "convert.docx_to_pdf.fallback_success",
                input=str(docx_path),
                output=str(output_path),
            )
            return output_path
        except Exception as fallback_exc:
            logger.exception(
                "convert.docx_to_pdf.failed",
                input=str(docx_path),
                error=str(fallback_exc),
            )
            raise

    def _docx_to_pdf_libreoffice(self, docx_path: Path, output_path: Path) -> None:
        executable = shutil.which("libreoffice") or shutil.which("soffice")
        if not executable:
            raise RuntimeError("LibreOffice CLI is not available.")

        output_dir = output_path.parent
        cmd = [
            executable,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output_dir),
            str(docx_path),
        ]

        logger.info("convert.docx_to_pdf.libreoffice_start", command=cmd)
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)

        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "LibreOffice conversion failed.")

        converted_path = output_dir / f"{docx_path.stem}.pdf"
        if not converted_path.exists():
            raise RuntimeError("LibreOffice did not create PDF output.")

        if converted_path.resolve() != output_path.resolve():
            converted_path.replace(output_path)

    def _docx_to_pdf_fallback(self, docx_path: Path, output_path: Path) -> None:
        document = Document(str(docx_path))
        pdf = canvas.Canvas(str(output_path), pagesize=A4)

        page_width, page_height = A4
        left_margin = 50
        right_margin = 50
        top_margin = 50
        bottom_margin = 50
        line_height = 16
        y_position = page_height - top_margin

        for paragraph in document.paragraphs:
            text = paragraph.text.strip()
            if not text:
                y_position -= line_height
                if y_position < bottom_margin:
                    pdf.showPage()
                    y_position = page_height - top_margin
                continue

            lines = self._wrap_text(
                text=text,
                max_width=page_width - left_margin - right_margin,
                font_name="Helvetica",
                font_size=11,
            )

            for line in lines:
                if y_position < bottom_margin:
                    pdf.showPage()
                    y_position = page_height - top_margin

                pdf.setFont("Helvetica", 11)
                pdf.drawString(left_margin, y_position, line)
                y_position -= line_height

            y_position -= 4

        pdf.save()

    def _wrap_text(self, text: str, max_width: float, font_name: str, font_size: int) -> list[str]:
        words = text.split()
        if not words:
            return [""]

        lines: list[str] = []
        current_line = words[0]

        for word in words[1:]:
            candidate = f"{current_line} {word}"
            width = stringWidth(candidate, font_name, font_size)
            if width <= max_width:
                current_line = candidate
            else:
                lines.append(current_line)
                current_line = word

        lines.append(current_line)
        return lines

    def _create_zip(self, file_paths: list[Path], zip_path: Path) -> None:
        with zipfile.ZipFile(str(zip_path), "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_path in file_paths:
                archive.write(file_path, arcname=file_path.name)