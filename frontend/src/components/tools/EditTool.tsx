import { useMemo, useState } from "react";
import { Download, FilePenLine } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile } from "@/api/hooks/useUpload";
import { useEdit } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import SortablePageGrid from "@/components/ui/SortablePageGrid";
import { useToolStore } from "@/store/useToolStore";
import type { EditOperation } from "@/types";

export default function EditTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useEdit();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);

  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageOrder, setPageOrder] = useState<number[]>([]);
  const [operations, setOperations] = useState<EditOperation[]>([]);

  const file = files[0];
  const totalPages = file?.pageCount ?? 0;

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

      setSelectedPages([]);
      setOperations([]);

      const uploadedFile = uploaded[0];
      const uploadedPageCount = uploadedFile?.pageCount ?? 0;

      setPageOrder(Array.from({ length: uploadedPageCount }, (_, index) => index));

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
      setSelectedPages([]);
      setOperations([]);
      setPageOrder([]);
      toast.success("Файл видалено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const appendOperation = (operation: EditOperation) => {
    setOperations((prev) => [...prev, operation]);
  };

  const handleRotateSelected = () => {
    if (selectedPages.length === 0) {
      toast.error("Спочатку вибери сторінки");
      return;
    }

    appendOperation({
      type: "rotate",
      payload: {
        pages: selectedPages,
        degrees: 90
      }
    });

    toast.success("Операцію повороту додано");
  };

  const handleDeleteSelected = () => {
    if (selectedPages.length === 0) {
      toast.error("Спочатку вибери сторінки");
      return;
    }

    appendOperation({
      type: "deletePages",
      payload: {
        pages: selectedPages
      }
    });

    toast.success("Операцію видалення додано");
  };

  const handleExtractSelected = () => {
    if (selectedPages.length === 0) {
      toast.error("Спочатку вибери сторінки");
      return;
    }

    appendOperation({
      type: "extractPages",
      payload: {
        pages: selectedPages
      }
    });

    toast.success("Операцію витягання додано");
  };

  const handleSave = async () => {
    if (!file) {
      toast.error("Завантаж PDF");
      return;
    }

    const finalOperations: EditOperation[] = [...operations];

    if (pageOrder.length === totalPages && totalPages > 0) {
      finalOperations.unshift({
        type: "reorderPages",
        payload: {
          order: pageOrder
        }
      });
    }

    try {
      await execute({
        fileId: file.id,
        operations: finalOperations
      });

      toast.success("Редагування завершено");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
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
            <FilePenLine className="h-7 w-7" />
          </div>

          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">
            Редагування сторінок
          </h3>

          <p className="mt-2 text-sm text-slate-600">
            Завантаж PDF, змінюй порядок сторінок та застосовуй дії.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />

          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Сторінок: <span className="font-semibold">{totalPages}</span> | Вибрано:{" "}
            <span className="font-semibold">{selectedPages.length}</span>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleRotateSelected} type="button">
              Повернути вибрані
            </Button>

            <Button onClick={handleDeleteSelected} type="button" variant="danger">
              Видалити вибрані
            </Button>

            <Button onClick={handleExtractSelected} type="button" variant="secondary">
              Витягти вибрані
            </Button>
          </div>

          <SortablePageGrid
            fileId={file.id}
            totalPages={totalPages}
            selectable
            onSelect={setSelectedPages}
            onReorder={setPageOrder}
            onRotate={(pageNum) =>
              appendOperation({
                type: "rotate",
                payload: {
                  pages: [pageNum],
                  degrees: 90
                }
              })
            }
            onDelete={(pageNum) =>
              appendOperation({
                type: "deletePages",
                payload: {
                  pages: [pageNum]
                }
              })
            }
            onDuplicate={(pageNum) =>
              appendOperation({
                type: "insertFile",
                payload: {
                  sourcePage: pageNum,
                  insertAfter: pageNum
                }
              })
            }
          />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-900">Черга операцій</h4>

            {operations.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">Операції ще не додані.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {operations.map((operation, index) => (
                  <div
                    key={`${operation.type}-${index}`}
                    className="rounded-xl border border-slate-200 bg-white p-3"
                  >
                    <p className="text-sm font-medium text-slate-900">
                      {index + 1}. {operation.type}
                    </p>
                    <pre className="mt-2 overflow-x-auto text-xs text-slate-600">
                      {JSON.stringify(operation.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleSave} loading={isLoading} aria-label="Зберегти і завантажити">
              Зберегти і завантажити
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
          <ProgressBar progress={jobStatus?.progress} label="Редагування" />
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>

          <div className="mt-3">
            <Button variant="danger" onClick={handleSave}>
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}