import { useMemo, useState } from "react";
import { Download, Gauge } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile } from "@/api/hooks/useUpload";
import { useCompress } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import { useToolStore } from "@/store/useToolStore";
import { formatBytes } from "@/utils/formatBytes";

type CompressionLevel = "low" | "medium" | "high" | "extreme";
type CompressQuality = "low" | "medium" | "high";

const levels: Array<{ value: CompressionLevel; title: string; description: string }> = [
  { value: "low", title: "Low", description: "Швидке стиснення без агресивної втрати якості." },
  { value: "medium", title: "Medium", description: "Баланс між якістю та розміром файла." },
  { value: "high", title: "High", description: "Сильніше стиснення для веб і пересилання." },
  { value: "extreme", title: "Extreme", description: "Максимальне зменшення розміру документа." }
];

function mapCompressionLevelToQuality(level: CompressionLevel): CompressQuality {
  if (level === "extreme") {
    return "high";
  }

  return level;
}

function getImageQuality(level: CompressionLevel): number {
  if (level === "low") {
    return 85;
  }

  if (level === "medium") {
    return 70;
  }

  if (level === "high") {
    return 55;
  }

  return 40;
}

function getPreviewRatio(level: CompressionLevel): number {
  if (level === "low") {
    return 0.8;
  }

  if (level === "medium") {
    return 0.6;
  }

  if (level === "high") {
    return 0.45;
  }

  return 0.35;
}

export default function CompressTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useCompress();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);

  const [level, setLevel] = useState<CompressionLevel>("medium");
  const [optimizeImages, setOptimizeImages] = useState(true);
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [compressedSizePreview, setCompressedSizePreview] = useState<number | null>(null);

  const file = files[0];

  const handleUpload = async (inputFiles: File[]) => {
    const selectedFile = inputFiles[0];

    if (!selectedFile) {
      toast.error("Оберіть PDF файл");
      return;
    }

    try {
      clearFiles();

      const uploaded = await uploadFiles([selectedFile]);

      uploaded.forEach((uploadedFile) => {
        addFile(uploadedFile);
      });

      setCompressedSizePreview(null);
      toast.success("PDF завантажено");
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
      setCompressedSizePreview(null);
      toast.success("Файл видалено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleExecute = async () => {
    if (!file) {
      toast.error("Спочатку завантаж PDF");
      return;
    }

    const previewRatio = getPreviewRatio(level);
    setCompressedSizePreview(Math.max(Math.round(file.sizeBytes * previewRatio), 1));

    try {
      await execute({
        fileId: file.id,
        quality: mapCompressionLevelToQuality(level),
        optimizeImages,
        imageQuality: getImageQuality(level),
        removeMetadata
      });

      toast.success("Стиснення завершено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Compression failed");
    }
  };

  const reductionPercent =
    file && compressedSizePreview
      ? Math.max(0, Math.round((1 - compressedSizePreview / file.sizeBytes) * 100))
      : null;

  return (
    <div className="space-y-5">
      <DropZone
        accept={{ "application/pdf": [".pdf"] }}
        multiple={false}
        maxSize={50 * 1024 * 1024}
        onFilesAccepted={handleUpload}
        onError={(message) => toast.error(message)}
      />

      {!file ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-accent">
            <Gauge className="h-7 w-7" />
          </div>

          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Стиснення PDF</h3>

          <p className="mt-2 text-sm text-slate-600">
            Завантаж PDF та обери рівень стискання.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Поточний розмір: <span className="font-semibold">{formatBytes(file.sizeBytes)}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {levels.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setLevel(item.value)}
                className={`rounded-2xl border p-4 text-left transition-all duration-200 ${
                  level === item.value
                    ? "border-accent bg-accent/5 shadow-soft"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <h4 className="font-syne text-lg font-bold text-slate-900">{item.title}</h4>
                <p className="mt-2 text-sm text-slate-600">{item.description}</p>
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <span className="text-sm font-medium text-slate-700">Оптимізувати зображення</span>
            <input
              type="checkbox"
              checked={optimizeImages}
              onChange={(event) => setOptimizeImages(event.target.checked)}
              className="h-5 w-5 accent-accent"
            />
          </label>

          <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <span className="text-sm font-medium text-slate-700">Видалити метадані</span>
            <input
              type="checkbox"
              checked={removeMetadata}
              onChange={(event) => setRemoveMetadata(event.target.checked)}
              className="h-5 w-5 accent-accent"
            />
          </label>

          {compressedSizePreview && file ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-5 transition-all duration-200">
              <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-center sm:justify-center sm:text-left">
                <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                  До: <span className="font-semibold">{formatBytes(file.sizeBytes)}</span>
                </div>

                <div className="text-xl font-bold text-green-700">→</div>

                <div className="rounded-xl bg-white px-4 py-3 shadow-sm">
                  Після: <span className="font-semibold">{formatBytes(compressedSizePreview)}</span>
                </div>

                <div className="rounded-xl bg-green-600 px-4 py-3 text-white shadow-sm">
                  -{reductionPercent}%
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleExecute} loading={isLoading} aria-label="Стиснути PDF">
              Стиснути PDF
            </Button>

            {downloadUrl ? (
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                Завантажити
              </a>
            ) : null}
          </div>
        </div>
      )}

      {(isLoading || jobStatus) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <ProgressBar progress={jobStatus?.progress} label="Стиснення" />
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <Button variant="danger" onClick={handleExecute}>
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}