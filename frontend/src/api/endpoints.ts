
// Base
export const API = {
  HEALTH: "/api/health"
} as const;

// Session
export const SESSION = {
  INIT: "/api/v1/session/init",
  INFO: "/api/v1/session",
  UPLOAD: "/api/v1/session/upload",
  FILES: "/api/v1/session/files",
  FILE: (fileId: string) => `/api/v1/session/files/${fileId}`,
  THUMBNAIL: (fileId: string, pageIndex: number) =>
    `/api/v1/session/thumbnail/${fileId}/${pageIndex}`
} as const;

// Tools
export const MERGE = {
  RUN: "/api/v1/merge/execute"
} as const;

export const SPLIT = {
  RUN: "/api/v1/split/execute"
} as const;

export const EDIT = {
  RUN: "/api/v1/edit/execute"
} as const;

export const COMPRESS = {
  RUN: "/api/v1/compress/execute"
} as const;

export const EXTRACT = {
  RUN: "/api/v1/extract/execute"
} as const;

export const DELETE_PAGES = {
  RUN: "/api/v1/delete-pages/execute"
} as const;

export const CONVERT = {
  RUN: "/api/v1/convert/execute"
} as const;

export const CROP = {
  RUN: "/api/v1/crop/execute"
} as const;

export const ALIGN = {
  RUN: "/api/v1/align/execute"
} as const;

// Jobs
export const JOBS = {
  STATUS: (jobId: string) => `/api/v1/jobs/${jobId}/status`,
  DOWNLOAD: (jobId: string) => `/api/v1/jobs/${jobId}/download`
} as const;