import { GripVertical, FileText, X } from "lucide-react";

import type { UploadedFile } from "@/types";
import { formatBytes } from "@/utils/formatBytes";

type FileCardProps = {
  file: UploadedFile;
  onRemove?: (fileId: string) => void;
  dragHandle?: boolean;
};

export default function FileCard({ file, onRemove, dragHandle = false }: FileCardProps) {
  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-soft">
      {dragHandle ? (
        <div
          className="inline-flex h-10 w-8 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 group-hover:text-slate-700"
          aria-label="Перетягнути файл"
        >
          <GripVertical className="h-5 w-5" />
        </div>
      ) : null}

      <div className="flex h-[80px] w-[60px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <FileText className="h-6 w-6 text-slate-400" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900" title={file.originalName}>
          {file.originalName}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{formatBytes(file.sizeBytes)}</span>
          <span>•</span>
          <span>{file.pageCount ?? "—"} стор.</span>
        </div>
      </div>

      {onRemove ? (
        <button
          type="button"
          aria-label={`Видалити ${file.originalName}`}
          onClick={() => onRemove(file.id)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:scale-105 hover:bg-red-50 hover:text-red-500"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}