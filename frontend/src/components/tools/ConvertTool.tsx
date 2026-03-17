import { useMemo, useState } from "react";
import { ArrowRightLeft, Download } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile } from "@/api/hooks/useUpload";
import { useConvert } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import { useToolStore } from "@/store/useToolStore";

type SupportedSourceFormat = "" | "pdf" | "jpg" | "png" | "webp" | "docx";
type SupportedTargetFormat = "" | "pdf" | "jpg";

function detectFormat(file: File | { originalName: string; mimeType: string }): SupportedSourceFormat {
  const name = "name" in file ? file.name : file.originalName;
  const mimeType = "type" in file ? file.type : file.mimeType;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (mimeType.includes("pdf") || ext === "pdf") {
    return "pdf";
  }

  if (mimeType.includes("jpeg") || mimeType.includes("jpg") || ext === "jpg" || ext === "jpeg") {
    return "jpg";
  }

  if (mimeType.includes("png") || ext === "png") {
    return "png";
  }

  if (mimeType.includes("webp") || ext === "webp") {
    return "webp";
  }

  if (
    mimeType.includes("word") ||
    mimeType.includes("officedocument.wordprocessingml.document") ||
    ext === "docx"
  ) {
    return "docx";
  }

  return "";
}

function getTargetFormat(fromFormat: SupportedSourceFormat): SupportedTargetFormat {
  if (fromFormat === "pdf") {
    return "jpg";
  }

  if (fromFormat === "docx" || fromFormat === "jpg" || fromFormat === "png" || fromFormat === "webp") {
    return "pdf";
  }

  return "";
}

export default function ConvertTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useConvert();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);

  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(85);

  const file = files[0];
  const fromFormat = file ? detectFormat(file) : "";
  const toFormat = getTargetFormat(fromFormat);

  const handleUpload = async (inputFiles: File[]) => {
    const selectedFile = inputFiles[0];

    if (!selectedFile) {
      toast.error("Оберіть файл");
      return;
    }

    try {
      clearFiles();

      const uploaded = await uploadFiles([selectedFile]);

      uploaded.forEach((uploadedFile) => {
        addFile(uploadedFile);
      });

      toast.success("Файл завантажено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleRemove = async () => {
    if (!file) {
      return;
    }

    try {
      await deleteFileRequest(file.id);
      removeFile(file.id);
      toast.success("Файл видалено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleConvert = async () => {
    if (!file || !fromFormat || !toFormat) {
      toast.error("Непідтримуваний формат");
      return;
    }

    try {
      await execute({
        fileId: file.id,
        fromFormat,
        toFormat,
        target: toFormat === "pdf" ? "pdf" : "images",
        dpi,
        quality
      });

      toast.success("Конвертацію завершено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Convert failed");
    }
  };

  const isPdfToImage = fromFormat === "pdf" && toFormat === "jpg";

  return (
    <div className="space-y-5">
      <DropZone
        accept={{
          "application/pdf": [".pdf"],
          "image/jpeg": [".jpg", ".jpeg"],
          "image/png": [".png"],
          "image/webp": [".webp"],
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"]
        }}
        multiple={false}
        maxSize={50 * 1024 * 1024}
        onFilesAccepted={handleUpload}
        onError={(message) => toast.error(message)}
      />

      {!file ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-accent">
            <ArrowRightLeft className="h-7 w-7" />
          </div>

          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Конвертація файлів</h3>

          <p className="mt-2 text-sm text-slate-600">
            PDF → JPG, JPG/PNG/WEBP → PDF, DOCX → PDF.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <span className="font-semibold uppercase">{fromFormat || "unknown"}</span> →{" "}
            <span className="font-semibold uppercase">{toFormat || "unknown"}</span>
          </div>

          {isPdfToImage ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">DPI</label>
              <select
                value={dpi}
                onChange={(event) => setDpi(Number(event.target.value))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
              >
                {[72, 96, 150, 300].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {toFormat === "jpg" ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Якість зображення: {quality}
              </label>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="w-full accent-accent"
              />
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
            {toFormat === "pdf"
              ? "Результат буде згенерований у PDF."
              : "Результат буде запакований у ZIP з зображеннями."}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleConvert} loading={isLoading}>
              Конвертувати
            </Button>

            {downloadUrl ? (
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                Завантажити результат
              </a>
            ) : null}
          </div>
        </div>
      )}

      {(isLoading || jobStatus) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <ProgressBar progress={jobStatus?.progress} label="Конвертація" />
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <Button variant="danger" onClick={handleConvert}>
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}