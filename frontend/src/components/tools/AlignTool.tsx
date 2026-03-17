import { useMemo, useState } from "react";
import { AlignJustify, Download } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile } from "@/api/hooks/useUpload";
import { useAlign } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import { useToolStore } from "@/store/useToolStore";

export default function AlignTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useAlign();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);

  const [autoRotate, setAutoRotate] = useState(true);
  const [normalizeSize, setNormalizeSize] = useState(true);
  const [fixOrientation, setFixOrientation] = useState(true);
  const [targetSize, setTargetSize] = useState<"A4" | "Letter" | "Original">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape" | "auto">("portrait");

  const file = files[0];

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

  const handleAlign = async () => {
    if (!file) {
      toast.error("Завантаж PDF");
      return;
    }

    await execute({
      fileId: file.id,
      mode: "auto",
      autoRotate,
      normalizeSize,
      targetSize,
      orientation: fixOrientation ? orientation : "auto"
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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-accent">
            <AlignJustify className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Вирівнювання PDF</h3>
          <p className="mt-2 text-sm text-slate-600">
            Нормалізуй орієнтацію та формат сторінок документа.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />

          <div className="space-y-3">
            <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
              <div>
                <p className="text-sm font-medium text-slate-800">☑ Авто-поворот сторінок</p>
                <p className="mt-1 text-xs text-slate-500">Спробує автоматично повернути сторінки у правильний бік.</p>
              </div>
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                className="mt-1 h-5 w-5 accent-accent"
              />
            </label>

            <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
              <div>
                <p className="text-sm font-medium text-slate-800">☑ Нормалізувати розмір</p>
                <p className="mt-1 text-xs text-slate-500">Приведе сторінки до єдиного формату.</p>
              </div>
              <input
                type="checkbox"
                checked={normalizeSize}
                onChange={(e) => setNormalizeSize(e.target.checked)}
                className="mt-1 h-5 w-5 accent-accent"
              />
            </label>

            <label className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
              <div>
                <p className="text-sm font-medium text-slate-800">☑ Виправити орієнтацію</p>
                <p className="mt-1 text-xs text-slate-500">Задає бажану книжну або альбомну орієнтацію.</p>
              </div>
              <input
                type="checkbox"
                checked={fixOrientation}
                onChange={(e) => setFixOrientation(e.target.checked)}
                className="mt-1 h-5 w-5 accent-accent"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Цільовий формат</label>
              <select
                value={targetSize}
                onChange={(e) => setTargetSize(e.target.value as "A4" | "Letter" | "Original")}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
                <option value="Original">Оригінал</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Орієнтація</label>
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as "portrait" | "landscape" | "auto")}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
              >
                <option value="portrait">Книжна</option>
                <option value="landscape">Альбомна</option>
                <option value="auto">Авто</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleAlign} loading={isLoading}>
              Вирівняти і завантажити
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
          <ProgressBar progress={jobStatus?.progress} label="Вирівнювання" />
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <Button variant="danger" onClick={handleAlign}>
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}