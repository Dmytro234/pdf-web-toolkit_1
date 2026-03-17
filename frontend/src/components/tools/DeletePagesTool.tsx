import { useMemo, useState } from "react";
import { Download, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile } from "@/api/hooks/useUpload";
import { useDeletePages } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import SortablePageGrid from "@/components/ui/SortablePageGrid";
import { useToolStore } from "@/store/useToolStore";

export default function DeletePagesTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useDeletePages();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  const file = files[0];
  const totalPages = file?.pageCount ?? 0;
  const remainingPages = totalPages - selectedPages.length;
  const deletingAll = totalPages > 0 && selectedPages.length >= totalPages;

  const handleUpload = async (inputFiles: File[]) => {
    try {
      clearFiles();
      const uploaded = await uploadFiles([inputFiles[0]]);
      uploaded.forEach(addFile);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const handleRemove = async () => {
    if (!file) return;
    try {
      await deleteFileRequest(file.id);
      removeFile(file.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleDeletePages = async () => {
    if (!file || !selectedPages.length) {
      toast.error("Оберіть сторінки для видалення");
      return;
    }

    if (deletingAll) {
      toast.error("Не можна видалити всі сторінки");
      return;
    }

    await execute({
      fileId: file.id,
      pagesToDelete: selectedPages
    });
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-red-500">
            <Trash2 className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Видалення сторінок</h3>
          <p className="mt-2 text-sm text-slate-600">
            Виділи сторінки, які потрібно прибрати з документа.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />

          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Буде видалено: <span className="font-semibold">{selectedPages.length}</span> | Залишиться:{" "}
            <span className="font-semibold">{remainingPages}</span>
          </div>

          <SortablePageGrid
            fileId={file.id}
            totalPages={totalPages}
            selectable
            onSelect={setSelectedPages}
            onReorder={() => {}}
          />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="danger"
              onClick={handleDeletePages}
              loading={isLoading}
              disabled={deletingAll || selectedPages.length === 0}
            >
              Видалити сторінки
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
          <ProgressBar progress={jobStatus?.progress} label="Видалення сторінок" />
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <Button variant="danger" onClick={handleDeletePages}>
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}