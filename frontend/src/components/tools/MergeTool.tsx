import { useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FilePlus2, Download, Layers3 } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile } from "@/api/hooks/useUpload";
import { useMerge } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import { useToolStore } from "@/store/useToolStore";
import type { UploadedFile } from "@/types";

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-accent shadow-sm">
        <Layers3 className="h-7 w-7" />
      </div>
      <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Об’єднай кілька PDF в один</h3>
      <p className="mt-2 text-sm text-slate-600">
        Завантаж кілька PDF, зміни порядок перетягуванням і запусти об’єднання.
      </p>
    </div>
  );
}

export default function MergeTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const removeFile = useToolStore((state) => state.removeFile);
  const reorderFiles = useToolStore((state) => state.reorderFiles);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const [uploading, setUploading] = useState(false);

  const { execute, isLoading, error, downloadUrl } = useMerge();

  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const handleUpload = async (inputFiles: File[]) => {
    try {
      setUploading(true);
      const uploadedFiles = await uploadFiles(inputFiles);
      uploadedFiles.forEach(addFile);
      toast.success("Файли завантажено");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося завантажити файли");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (fileId: string) => {
    try {
      await deleteFileRequest(fileId);
      removeFile(fileId);
      toast.success("Файл видалено");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не вдалося видалити файл");
    }
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      toast.error("Завантаж щонайменше два PDF");
      return;
    }

    await execute({
      orderedFileIds: files.map((file) => file.id)
    });
  };

  const handleDragEnd = (event: any) => {
    const activeItem = event.active;
    const overItem = event.over;

    if (!overItem || activeItem.id === overItem.id) {
      return;
    }

    const fromIndex = files.findIndex((file) => file.id === activeItem.id);
    const toIndex = files.findIndex((file) => file.id === overItem.id);

    if (fromIndex >= 0 && toIndex >= 0) {
      reorderFiles(fromIndex, toIndex);
    }
  };

  const isSuccess = Boolean(downloadUrl);

  return (
    <div className="space-y-5">
      {!files.length ? <EmptyState /> : null}

      <DropZone
        accept={{ "application/pdf": [".pdf"] }}
        multiple
        maxSize={50 * 1024 * 1024}
        uploading={uploading}
        onFilesAccepted={handleUpload}
        onError={(message) => toast.error(message)}
      />

      {files.length > 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-syne text-xl font-bold text-slate-900">Порядок файлів</h3>
              <p className="text-sm text-slate-600">Перетягни картки, щоб змінити порядок об’єднання.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {files.length} файлів
            </span>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={files.map((file) => file.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {files.map((file: UploadedFile) => (
                  <div key={file.id} id={file.id}>
                    <FileCard file={file} onRemove={handleRemove} dragHandle />
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              onClick={handleMerge}
              loading={isLoading}
              disabled={uploading || files.length < 2}
              leftIcon={<FilePlus2 className="h-4 w-4" />}
              aria-label="Об'єднати PDF"
            >
              Об'єднати PDF
            </Button>

            {isSuccess ? (
              <a
                href={downloadUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                Завантажити результат
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {isLoading || jobStatus ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <ProgressBar
            progress={jobStatus?.progress}
            label={jobStatus?.state === "success" ? "Готово" : "Обробка"}
            variant={
              jobStatus?.state === "failed"
                ? "error"
                : jobStatus?.state === "success"
                  ? "success"
                  : "default"
            }
          />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <Button variant="danger" onClick={handleMerge} aria-label="Спробувати знову">
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}

      {isSuccess ? (
        <div className="animate-in rounded-2xl border border-green-200 bg-green-50 p-4 duration-200">
          <p className="text-sm text-green-700">PDF успішно об’єднано. Можеш завантажити готовий файл.</p>
        </div>
      ) : null}
    </div>
  );
}