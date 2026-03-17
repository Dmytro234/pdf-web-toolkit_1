import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

import { api, buildApiUrl } from "@/api/client";
import { SESSION } from "@/api/endpoints";
import { useToolStore } from "@/store/useToolStore";
import type { UploadedFile } from "@/types";

type SessionFilesHook = {
  files: UploadedFile[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<UploadedFile[]>;
};

function normalizeUploadedFile(input: any): UploadedFile {
  return {
    id: String(input.id ?? input.file_id ?? ""),
    originalName: String(
      input.original_name ??
        input.originalName ??
        input.download_name ??
        "Unnamed file"
    ),
    mimeType: String(
      input.mime_type ??
        input.mimeType ??
        "application/octet-stream"
    ),
    sizeBytes: Number(
      input.size ??
        input.size_bytes ??
        input.sizeBytes ??
        0
    ),
    pageCount:
      typeof input.page_count === "number"
        ? input.page_count
        : typeof input.pageCount === "number"
          ? input.pageCount
          : undefined,
    createdAtIso: String(
      input.uploaded_at ??
        input.created_at ??
        input.createdAtIso ??
        new Date().toISOString()
    )
  };
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: string }).message ?? "Request failed");
  }

  return "Request failed";
}

export async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  if (!files.length) {
    return [];
  }

  const form = new FormData();

  files.forEach((file) => {
    form.append("files", file, file.name);
  });

  const response = await api.postForm<{ session_id: string; files: any[] }>(
    SESSION.UPLOAD,
    form
  );

  if (!response.ok || !response.data) {
    throw new Error(response.error?.message ?? "Upload failed");
  }

  return (response.data.files ?? []).map(normalizeUploadedFile);
}

export function getThumbnailUrl(fileId: string, page: number): string {
  return buildApiUrl(SESSION.THUMBNAIL(fileId, page));
}

export function deleteSessionFile() {
  return async (id: string): Promise<void> => {
    const response = await api.delete<{ deleted: boolean }>(SESSION.FILE(id));

    if (!response.ok) {
      throw new Error(response.error?.message ?? "Failed to delete file");
    }
  };
}

export function useSessionFiles(): SessionFilesHook {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadedFiles = useToolStore((state) => state.uploadedFiles);
  const addFile = useToolStore((state) => state.addFile);
  const clearFiles = useToolStore((state) => state.clearFiles);

  const refresh = useCallback(async (): Promise<UploadedFile[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get<any[]>(SESSION.FILES);

      if (!response.ok || !response.data) {
        throw new Error(response.error?.message ?? "Failed to load session files");
      }

      const normalized = response.data.map(normalizeUploadedFile);

      clearFiles();
      normalized.forEach(addFile);

      return normalized;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [addFile, clearFiles]);

  useEffect(() => {
    void refresh().catch(() => {
      toast.error("Не вдалося завантажити файли сесії");
    });
  }, [refresh]);

  return {
    files: uploadedFiles,
    isLoading,
    error,
    refresh
  };
}