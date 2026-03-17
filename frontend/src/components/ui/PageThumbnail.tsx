import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  Copy,
  Loader2,
  RotateCw,
  Square,
  Trash2
} from "lucide-react";

import { buildApiUrl } from "@/api/client";

type PageThumbnailProps = {
  fileId: string;
  pageNum: number;
  selected?: boolean;
  onSelect?: (pageNum: number) => void;
  onRotate?: (pageNum: number) => void;
  onDelete?: (pageNum: number) => void;
  onDuplicate?: (pageNum: number) => void;
};

export default function PageThumbnail({
  fileId,
  pageNum,
  selected = false,
  onSelect,
  onRotate,
  onDelete,
  onDuplicate
}: PageThumbnailProps) {
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  const imageUrl = useMemo(() => {
    return buildApiUrl(`/api/v1/session/thumbnail/${fileId}/${pageNum}`);
  }, [fileId, pageNum]);

  useEffect(() => {
    setLoading(true);
    setErrored(false);
  }, [imageUrl]);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-white transition-all duration-200 ${
        selected
          ? "border-accent shadow-soft ring-2 ring-accent/10"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-soft"
      }`}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : null}

        {errored ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 px-3 text-center text-xs text-slate-500">
            Preview unavailable
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={`Сторінка ${pageNum + 1}`}
            className={`h-full w-full object-cover transition-opacity duration-200 ${
              loading ? "opacity-0" : "opacity-100"
            }`}
            loading="lazy"
            draggable={false}
            onLoad={() => {
              setLoading(false);
              setErrored(false);
            }}
            onError={() => {
              setLoading(false);
              setErrored(true);
            }}
          />
        )}

        <div className="absolute left-2 top-2 z-20">
          <button
            type="button"
            aria-label={selected ? "Зняти вибір зі сторінки" : "Вибрати сторінку"}
            onClick={() => onSelect?.(pageNum)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-700 shadow transition-all duration-200 hover:bg-white"
          >
            {selected ? (
              <CheckSquare className="h-4 w-4 text-accent" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-3 items-center justify-center gap-1 bg-gradient-to-t from-black/55 to-transparent p-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Повернути сторінку"
            onClick={() => onRotate?.(pageNum)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-800 transition-all duration-200 hover:bg-white"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            aria-label="Дублювати сторінку"
            onClick={() => onDuplicate?.(pageNum)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-800 transition-all duration-200 hover:bg-white"
          >
            <Copy className="h-4 w-4" />
          </button>

          <button
            type="button"
            aria-label="Видалити сторінку"
            onClick={() => onDelete?.(pageNum)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-red-600 transition-all duration-200 hover:bg-white"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 px-3 py-2 text-center text-sm font-medium text-slate-700">
        {pageNum + 1}
      </div>
    </div>
  );
}