import { create } from "zustand";

import type { JobStatus, UploadedFile } from "@/types";

type ToolStore = {
  uploadedFiles: UploadedFile[];
  currentJobId: string | null;
  jobStatus: JobStatus | null;
  isProcessing: boolean;
  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  setJob: (jobId: string | null, isProcessing?: boolean) => void;
  updateJobStatus: (status: JobStatus | null) => void;
  reset: () => void;
  clearFiles: () => void;
};

const initialState = {
  uploadedFiles: [] as UploadedFile[],
  currentJobId: null as string | null,
  jobStatus: null as JobStatus | null,
  isProcessing: false
};

export const useToolStore = create<ToolStore>((set) => ({
  ...initialState,

  addFile: (file) =>
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, file]
    })),

  removeFile: (fileId) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((file) => file.id !== fileId)
    })),

  reorderFiles: (fromIndex, toIndex) =>
    set((state) => {
      const next = [...state.uploadedFiles];
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= next.length ||
        toIndex >= next.length
      ) {
        return { uploadedFiles: next };
      }

      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      return { uploadedFiles: next };
    }),

  setJob: (jobId, isProcessing = true) =>
    set(() => ({
      currentJobId: jobId,
      isProcessing,
      jobStatus: jobId
        ? {
            jobId,
            state: "queued",
            progress: 0
          }
        : null
    })),

  updateJobStatus: (status) =>
    set(() => ({
      jobStatus: status,
      currentJobId: status?.jobId ?? null,
      isProcessing: status ? status.state === "queued" || status.state === "running" : false
    })),

  clearFiles: () =>
    set(() => ({
      uploadedFiles: []
    })),

  reset: () =>
    set(() => ({
      ...initialState
    }))
}));