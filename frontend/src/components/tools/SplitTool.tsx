import { useMemo, useState } from "react";
import { Download, Scissors } from "lucide-react";
import toast from "react-hot-toast";

import { uploadFiles, deleteSessionFile } from "@/api/hooks/useUpload";
import { useSplit } from "@/api/hooks/useToolActions";
import Button from "@/components/ui/Button";
import DropZone from "@/components/ui/DropZone";
import FileCard from "@/components/ui/FileCard";
import ProgressBar from "@/components/ui/ProgressBar";
import { useToolStore } from "@/store/useToolStore";

type SplitMode = "pages" | "size" | "each_page" | "ranges";

export default function SplitTool() {
  const files = useToolStore((state) => state.uploadedFiles);
  const clearFiles = useToolStore((state) => state.clearFiles);
  const addFile = useToolStore((state) => state.addFile);
  const removeFile = useToolStore((state) => state.removeFile);
  const jobStatus = useToolStore((state) => state.jobStatus);

  const { execute, isLoading, error, downloadUrl } = useSplit();
  const deleteFileRequest = useMemo(() => deleteSessionFile(), []);

  const [mode, setMode] = useState<SplitMode>("pages");
  const [pagesPerChunk, setPagesPerChunk] = useState(2);
  const [sizeMb, setSizeMb] = useState(5);
  const [ranges, setRanges] = useState<string[]>(["1-3", "4-7"]);

  const file = files[0];

  const handleUpload = async (inputFiles: File[]) => {
    try {
      clearFiles();
      const uploaded = await uploadFiles([inputFiles[0]]);
      uploaded.forEach(addFile);
      toast.success("PDF завантажено");
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

  const handleExecute = async () => {
    if (!file) {
      toast.error("Спочатку завантаж PDF");
      return;
    }

    await execute({
      fileId: file.id,
      mode: mode === "pages" ? "byPages" : mode === "ranges" ? "byRanges" : ("byPages" as any),
      pagesPerFile: mode === "pages" ? pagesPerChunk : undefined,
      sizeMb: mode === "size" ? sizeMb : undefined,
      ranges: mode === "ranges" ? ranges.join(",") : undefined
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
            <Scissors className="h-7 w-7" />
          </div>
          <h3 className="mt-4 font-syne text-xl font-bold text-slate-900">Розділення PDF</h3>
          <p className="mt-2 text-sm text-slate-600">
            Завантаж один PDF і обери спосіб розділення.
          </p>
        </div>
      ) : (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
          <FileCard file={file} onRemove={handleRemove} />
          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            Кількість сторінок: <span className="font-semibold">{file.pageCount ?? "—"}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { value: "pages", label: "By Pages" },
              { value: "size", label: "By Size" },
              { value: "each_page", label: "Each Page" },
              { value: "ranges", label: "Custom Ranges" }
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                aria-label={item.label}
                onClick={() => setMode(item.value as SplitMode)}
                className={`rounded-2xl border px-4 py-3 text-sm font-medium transition-all duration-200 ${
                  mode === item.value
                    ? "border-accent bg-accent/5 text-accent"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {mode === "pages" ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Сторінок на частину
              </label>
              <input
                type="number"
                min={1}
                value={pagesPerChunk}
                onChange={(e) => setPagesPerChunk(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
              />
            </div>
          ) : null}

          {mode === "size" ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                МБ на частину
              </label>
              <input
                type="number"
                min={1}
                value={sizeMb}
                onChange={(e) => setSizeMb(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
              />
            </div>
          ) : null}

          {mode === "each_page" ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
              Кожна сторінка буде збережена як окремий PDF і запакована у ZIP.
            </div>
          ) : null}

          {mode === "ranges" ? (
            <div className="space-y-3">
              {ranges.map((value, index) => (
                <div key={`${index}-${value}`} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) =>
                      setRanges((prev) => prev.map((item, i) => (i === index ? e.target.value : item)))
                    }
                    placeholder="1-3"
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all duration-200 focus:border-accent"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setRanges((prev) => [...prev, ""])}
                    aria-label="Додати діапазон"
                  >
                    +
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRanges((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Видалити діапазон"
                  >
                    −
                  </Button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Button onClick={handleExecute} loading={isLoading} aria-label="Розділити і завантажити ZIP">
              Розділити і завантажити ZIP
            </Button>

            {downloadUrl ? (
              <a
                href={downloadUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-green-700"
              >
                <Download className="h-4 w-4" />
                Завантажити ZIP
              </a>
            ) : null}
          </div>
        </div>
      )}

      {(isLoading || jobStatus) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <ProgressBar progress={jobStatus?.progress} label="Обробка" />
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