import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderParameters } from "pdfjs-dist/types/src/display/api";

let workerConfigured = false;

export function initPdfWorker(): void {
  if (workerConfigured) return;

  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  workerConfigured = true;
}

export async function renderPageToCanvas(
  url: string,
  pageNum: number,
  scale = 1.25
): Promise<HTMLCanvasElement> {
  initPdfWorker();

  const loadingTask = getDocument(url);
  const pdf: PDFDocumentProxy = await loadingTask.promise;

  try {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context is not available.");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const renderContext: RenderParameters = {
      canvasContext: context,
      viewport
    };

    await page.render(renderContext).promise;
    return canvas;
  } finally {
    await pdf.destroy();
  }
}