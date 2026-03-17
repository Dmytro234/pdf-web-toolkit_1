import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, Download } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile, getThumbnailUrl } from "@/api/hooks/useUpload";
import { useCrop } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import SortablePageGrid from "@/components/ui/SortablePageGrid";
import { useToolStore } from "@/store/useToolStore";

type Unit = "mm" | "pt" | "px";

export default function CropTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useCrop();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [top, setTop] = useState(10);
  const [right, setRight] = useState(10);
  const [bottom, setBottom] = useState(10);
  const [left, setLeft] = useState(10);
  const [unit, setUnit] = useState<Unit>("mm");
  const [applyToAll, setApplyToAll] = useState(true);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);

  const file = files[0];

  useEffect(() => {
    if (!file || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = getThumbnailUrl(file.id, 0);

    image.onload = () => {
      canvas.width = 360;
      canvas.height = 480;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const previewScale = 3;
      const rectX = left * previewScale;
      const rectY = top * previewScale;
      const rectW = canvas.width - (left + right) * previewScale;
      const rectH = canvas.height - (top + bottom) * previewScale;

      ctx.fillStyle = "rgba(232,64,64,0.12)";
      ctx.strokeStyle = "#E84040";
      ctx.lineWidth = 2;
      ctx.fillRect(rectX, rectY, rectW, rectH);
      ctx.strokeRect(rectX, rectY, rectW, rectH);
    };
  }, [bottom, file, left, right, top]);

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

  const handleCrop = async () => {
    if (!file) {
      toast.error("Завантаж PDF");
      return;
    }

    await execute({
      fileId: file.id,
      applyTo: applyToAll ? "all" : "pages",
      pages: applyToAll ? undefined : selectedPages,
      box: {
        x: left,
        y: top,
        width: right,
        height: bottom
      }
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
            <Crop className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Обрізання PDF</h3>
          <p className="mt-2 text-sm text-slate-600">
            Налаштуй поля та переглянь crop preview до запуску.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />

          <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-slate-200 p-4">
              <canvas ref={canvasRef} className="mx-auto w-full max-w-[360px] rounded-xl bg-slate-100" />
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Top", value: top, setter: setTop },
                  { label: "Right", value: right, setter: setRight },
                  { label: "Bottom", value: bottom, setter: setBottom },
                  { label: "Left", value: left, setter: setLeft }
                ].map((item) => (
                  <div key={item.label}>
                    <label className="mb-2 block text-sm font-medium text-slate-700">{item.label}</label>
                    <input
                      type="number"
                      value={item.value}
                      min={0}
                      onChange={(e) => item.setter(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Одиниці</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
                >
                  <option value="mm">mm</option>
                  <option value="pt">pt</option>
                  <option value="px">px</option>
                </select>
              </div>

              <label className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                <span className="text-sm font-medium text-slate-700">Застосувати до всіх сторінок</span>
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="h-5 w-5 accent-accent"
                />
              </label>
            </div>
          </div>

          {!applyToAll ? (
            <SortablePageGrid
              fileId={file.id}
              totalPages={file.pageCount ?? 0}
              selectable
              onSelect={setSelectedPages}
              onReorder={() => {}}
            />
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleCrop} loading={isLoading}>
              Обрізати і завантажити
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
          <ProgressBar progress={jobStatus?.progress} label="Обрізання" />
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-600">{error}</p>
          <div className="mt-3">
            <Button variant="danger" onClick={handleCrop}>
              Спробувати знову
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}