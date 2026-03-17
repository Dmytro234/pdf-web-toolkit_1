import { useCallback, useMemo, useState } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { AlertCircle, FileUp, Loader2 } from "lucide-react";

type DropZoneProps = {
  accept?: Accept;
  multiple?: boolean;
  maxSize?: number;
  onFilesAccepted: (files: File[]) => void;
  onError?: (message: string) => void;
  uploading?: boolean;
};

function formatAcceptLabel(accept?: Accept): string {
  if (!accept) return "Усі підтримувані формати";
  return Object.values(accept)
    .flat()
    .filter(Boolean)
    .join(", ");
}

export default function DropZone({
  accept,
  multiple = true,
  maxSize,
  onFilesAccepted,
  onError,
  uploading = false
}: DropZoneProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const acceptLabel = useMemo(() => formatAcceptLabel(accept), [accept]);
  const maxSizeLabel = useMemo(() => {
    if (!maxSize) return "Без ліміту";
    const mb = maxSize / (1024 * 1024);
    return `${mb.toFixed(mb % 1 === 0 ? 0 : 1)} MB`;
  }, [maxSize]);

  const handleRejected = useCallback(
    (rejections: FileRejection[]) => {
      const first = rejections[0];
      const message =
        first?.errors?.[0]?.message || "Файл не відповідає вимогам завантаження.";
      setErrorMessage(message);
      onError?.(message);
    },
    [onError]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setErrorMessage(null);

      if (rejectedFiles.length > 0) {
        handleRejected(rejectedFiles);
        return;
      }

      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
      }
    },
    [handleRejected, onFilesAccepted]
  );

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } =
    useDropzone({
      accept,
      multiple,
      maxSize,
      onDrop
    });

  const stateClass = uploading
    ? "border-slate-300 bg-slate-50"
    : isDragReject
      ? "scale-[1.01] border-red-400 bg-red-50"
      : isDragActive || isDragAccept
        ? "scale-[1.01] border-accent bg-accent/5"
        : "border-slate-300 bg-white hover:border-accent/60 hover:bg-slate-50";

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-3xl border-2 border-dashed p-6 text-center transition-all duration-200 sm:p-8 ${stateClass}`}
        aria-label="Зона завантаження файлів"
      >
        <input {...getInputProps()} aria-label="Вибір файлів" />

        <div className="mx-auto flex max-w-xl flex-col items-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : errorMessage ? (
              <AlertCircle className="h-6 w-6 text-red-500" />
            ) : (
              <FileUp className="h-6 w-6" />
            )}
          </div>

          <h3 className="font-syne text-xl font-bold text-slate-900">
            {uploading
              ? "Завантаження..."
              : isDragActive
                ? "Відпусти файл тут"
                : "Перетягни файли сюди"}
          </h3>

          <p className="mt-2 font-dmsans text-sm text-slate-600">
            або натисни, щоб вибрати {multiple ? "кілька файлів" : "файл"} з пристрою
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              Формати: {acceptLabel}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
              Ліміт: {maxSizeLabel}
            </span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}