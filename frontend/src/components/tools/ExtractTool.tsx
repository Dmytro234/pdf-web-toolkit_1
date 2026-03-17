
import { useMemo, useState } from "react";
import { Download, FileOutput } from "lucide-react";
import toast from "react-hot-toast";

import { buildApiUrl } from "@/api/client";
import { deleteSessionFile, uploadFiles } from "@/api/hooks/useUpload";
import { useExtract } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import SortablePageGrid from "@/components/ui/SortablePageGrid";
import { useToolStore } from "@/store/useToolStore";

function resolveDownloadUrl(downloadUrl: string | null | undefined): string {
  if (!downloadUrl) {
    return "";
  }

  return buildApiUrl(downloadUrl);
}

export default function ExtractTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useExtract();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  const file = files[0];
  const finalDownloadUrl = resolveDownloadUrl(downloadUrl);

  const handleUpload = async (inputFiles: File[]) => {
    try {
      clearFiles();
      setSelectedPages([]);

      const firstFile = inputFiles[0];
      if (!firstFile) {
        toast.error("Файл не вибрано");
        return;
      }

      const uploaded = await uploadFiles([firstFile]);
      uploaded.forEach(addFile);
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
      setSelectedPages([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleExtract = async () => {
    if (!file) {
      toast.error("Спочатку завантаж PDF файл");
      return;
    }

    if (!selectedPages.length) {
      toast.error("Оберіть сторінки для витягу");
      return;
    }

    await execute({
      fileId: file.id,
      pages: selectedPages
    });
  };

  const handleDownloadClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!finalDownloadUrl) {
      event.preventDefault();
      toast.error("Файл ще не готовий до завантаження");
    }
  };

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
            <FileOutput className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Витяг сторінок</h3>
          <p className="mt-2 text-sm text-slate-600">
            Виділи потрібні сторінки та створи новий PDF.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Обрано: <span className="font-semibold">{selectedPages.length}</span> сторінок
          </div>

          <SortablePageGrid
            fileId={file.id}
            totalPages={file.pageCount ?? 0}
            selectable
            onSelect={setSelectedPages}
            onReorder={() => {}}
          />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleExtract} loading={isLoading}>
              Витягти обрані
            </Button>

            {finalDownloadUrl ? (
              <a
                href={finalDownloadUrl}
                target="_blank"
                rel="noreferrer"
                onClick={handleDownloadClick}
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
          <ProgressBar progress={jobStatus?.progress} label="Витяг сторінок" />
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <Button variant="danger" onClick={handleExtract}>
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}