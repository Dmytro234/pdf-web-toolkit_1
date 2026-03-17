import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { api } from "@/api/client";
import {
  ALIGN,
  COMPRESS,
  CONVERT,
  CROP,
  DELETE_PAGES,
  EDIT,
  EXTRACT,
  MERGE,
  SPLIT
} from "@/api/endpoints";
import { useJob } from "@/api/hooks/useJob";
import type {
  AlignOptions,
  CompressOptions,
  ConvertOptions,
  CropOptions,
  EditOperation,
  ExtractOptions,
  MergeOptions,
  SplitOptions
} from "@/types";

type ExecuteResult = {
  job_id?: string;
  jobId?: string;
  status_url?: string;
};

type ToolHookResult<TOptions> = {
  execute: (options: TOptions) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  downloadUrl: string | null;
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: string }).message ?? "Request failed");
  }
  return "Request failed";
}

function useAsyncTool<TOptions>(
  endpoint: string,
  transformOptions?: (options: TOptions) => unknown
): ToolHookResult<TOptions> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const { startPolling } = useJob();

  const execute = useCallback(
    async (options: TOptions) => {
      setIsLoading(true);
      setError(null);
      setDownloadUrl(null);

      try {
        const response = await api.post<ExecuteResult, unknown>(
          endpoint,
          transformOptions ? transformOptions(options) : options
        );

        if (!response.ok || !response.data) {
          throw new Error(response.error?.message ?? "Failed to start job");
        }

        const jobId = response.data.job_id ?? response.data.jobId;
        if (!jobId) {
          throw new Error("Job ID was not returned");
        }

        startPolling(
          jobId,
          ({ resultUrl }) => {
            setIsLoading(false);
            setDownloadUrl(resultUrl);
          },
          (message) => {
            setIsLoading(false);
            setError(message);
          }
        );
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        setIsLoading(false);
        toast.error(message);
      }
    },
    [endpoint, startPolling, transformOptions]
  );

  return useMemo(
    () => ({
      execute,
      isLoading,
      error,
      downloadUrl
    }),
    [downloadUrl, error, execute, isLoading]
  );
}

export function useMerge(): ToolHookResult<MergeOptions> {
  return useAsyncTool<MergeOptions>(MERGE.RUN, (options) => ({
    file_ids: options.orderedFileIds,
    order: options.orderedFileIds.map((_, index) => index)
  }));
}

export function useSplit(): ToolHookResult<
  SplitOptions & {
    sizeMb?: number;
  }
> {
  return useAsyncTool(SPLIT.RUN, (options) => ({
    file_id: options.fileId,
    mode:
      options.mode === "byPages"
        ? "pages"
        : options.mode === "byRanges"
          ? "ranges"
          : options.mode === "each_page"
            ? "each_page"
            : "size",
    pages_per_chunk: options.pagesPerFile,
    size_mb: (options as SplitOptions & { sizeMb?: number }).sizeMb,
    ranges: options.ranges ? options.ranges.split(",").map((v) => v.trim()) : undefined
  }));
}

export function useEdit(): ToolHookResult<{ fileId: string; operations: EditOperation[] }> {
  return useAsyncTool(EDIT.RUN, (options) => ({
    file_id: options.fileId,
    operations: options.operations
  }));
}

export function useCompress(): ToolHookResult<
  CompressOptions & {
    optimizeImages: boolean;
    imageQuality: number;
    removeMetadata: boolean;
  }
> {
  return useAsyncTool(COMPRESS.RUN, (options) => ({
    file_id: options.fileId,
    level: options.quality,
    optimize_images: options.optimizeImages,
    image_quality: options.imageQuality,
    remove_metadata: options.removeMetadata
  }));
}

export function useExtract(): ToolHookResult<ExtractOptions> {
  return useAsyncTool(EXTRACT.RUN, (options) => ({
    file_id: options.fileId,
    pages: options.pages
  }));
}

export function useDeletePages(): ToolHookResult<{ fileId: string; pagesToDelete: number[] }> {
  return useAsyncTool(DELETE_PAGES.RUN, (options) => ({
    file_id: options.fileId,
    pages_to_delete: options.pagesToDelete
  }));
}

export function useConvert(): ToolHookResult<
  ConvertOptions & {
    fromFormat: string;
    toFormat: string;
    quality: number;
  }
> {
  return useAsyncTool(CONVERT.RUN, (options) => ({
    file_id: options.fileId,
    from_format: options.fromFormat,
    to_format: options.toFormat,
    dpi: options.dpi,
    quality: options.quality
  }));
}

export function useCrop(): ToolHookResult<
  CropOptions & {
    applyTo: "all" | "pages";
  }
> {
  return useAsyncTool(CROP.RUN, (options) => ({
    file_id: options.fileId,
    apply_to: options.applyTo,
    pages: options.pages,
    margins: {
      top: options.box.y,
      right: options.box.width,
      bottom: options.box.height,
      left: options.box.x
    },
    unit: "pt"
  }));
}

export function useAlign(): ToolHookResult<
  AlignOptions & {
    autoRotate: boolean;
    normalizeSize: boolean;
    targetSize: "A4" | "Letter" | "Original";
    orientation: "portrait" | "landscape" | "auto";
  }
> {
  return useAsyncTool(ALIGN.RUN, (options) => ({
    file_id: options.fileId,
    auto_rotate: options.autoRotate,
    normalize_size: options.normalizeSize,
    target_size: options.targetSize === "Original" ? "A4" : options.targetSize,
    orientation: options.orientation === "auto" ? "portrait" : options.orientation
  }));
}