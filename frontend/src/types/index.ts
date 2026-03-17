export type ID = string;

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
  meta?: Record<string, unknown>;
}

export interface UploadedFile {
  id: ID;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount?: number;
  createdAtIso: string;
}

export type JobState = "queued" | "running" | "success" | "failed";

export interface JobStatus {
  jobId: ID;
  state: JobState;
  progress: number;
  message?: string;
  resultFileId?: ID;
  error?: ApiError;
  startedAtIso?: string;
  finishedAtIso?: string;
  compressedSize?: number;
  originalSize?: number;
  reductionPercent?: number;
}

export interface PageInfo {
  index: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface ThumbnailInfo {
  pageIndex: number;
  width: number;
  height: number;
  url: string;
}

export interface MergeOptions {
  orderedFileIds: ID[];
  outputName?: string;
}

export type SplitMode = "byPages" | "byRanges" | "size" | "each_page";

export interface SplitOptions {
  fileId: ID;
  mode: SplitMode;
  pagesPerFile?: number;
  ranges?: string;
  outputNamePrefix?: string;
}

export type EditOperationType =
  | "rotate"
  | "deletePages"
  | "reorderPages"
  | "reorder"
  | "extractPages"
  | "insertFile";

export interface EditOperation {
  type: EditOperationType;
  payload: Record<string, unknown>;
}

export interface CompressOptions {
  fileId: ID;
  quality: "low" | "medium" | "high" | "extreme";
  outputName?: string;
}

export interface ExtractOptions {
  fileId: ID;
  pages: number[];
  outputName?: string;
}

export type ConvertTarget = "pdf" | "images" | "docx";

export interface ConvertOptions {
  fileId: ID;
  target: ConvertTarget;
  imageFormat?: "png" | "jpeg";
  dpi?: number;
  outputName?: string;
}

export interface CropOptions {
  fileId: ID;
  pages?: number[];
  box: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  outputName?: string;
}

export interface AlignOptions {
  fileId: ID;
  mode: "auto" | "deskew" | "center";
  pages?: number[];
  outputName?: string;
}