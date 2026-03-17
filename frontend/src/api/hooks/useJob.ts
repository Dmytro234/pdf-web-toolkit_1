import { useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";

import { api, buildApiUrl } from "@/api/client";
import { JOBS } from "@/api/endpoints";
import { useToolStore } from "@/store/useToolStore";
import type { JobStatus } from "@/types";

type JobStatusApi = {
  job_id?: string;
  status?: string;
  progress?: number;
  result_url?: string | null;
};

type PollingCompletePayload = {
  jobId: string;
  resultUrl: string | null;
  status: JobStatus;
};

const pollingIntervalMilliseconds = 1500;
const timeoutMilliseconds = 5 * 60 * 1000;

function normalizeState(status?: string): JobStatus["state"] {
  if (status === "success") {
    return "success";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "running") {
    return "running";
  }

  return "queued";
}

function normalizeJobStatus(jobId: string, data: JobStatusApi): JobStatus {
  return {
    jobId,
    state: normalizeState(data.status),
    progress: typeof data.progress === "number" ? data.progress : 0,
    message: typeof data.status === "string" ? data.status : undefined
  };
}

export function useJob() {
  const timerIdReference = useRef<number | null>(null);
  const pollingStartedAtReference = useRef<number>(0);

  const setJob = useToolStore((state) => state.setJob);
  const updateJobStatus = useToolStore((state) => state.updateJobStatus);

  const stopPolling = useCallback(() => {
    if (timerIdReference.current !== null) {
      window.clearTimeout(timerIdReference.current);
      timerIdReference.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (
      jobId: string,
      onComplete?: (payload: PollingCompletePayload) => void,
      onError?: (message: string) => void
    ) => {
      stopPolling();
      pollingStartedAtReference.current = Date.now();
      setJob(jobId, true);

      const tick = async () => {
        try {
          if (Date.now() - pollingStartedAtReference.current > timeoutMilliseconds) {
            stopPolling();

            updateJobStatus({
              jobId,
              state: "failed",
              progress: 100,
              message: "Timeout"
            });

            onError?.("Час очікування завершився");
            toast.error("Час очікування завершився");
            return;
          }

          const response = await api.get<JobStatusApi>(JOBS.STATUS(jobId));

          if (!response.ok || !response.data) {
            throw new Error(response.error?.message ?? "Failed to get job status");
          }

          const normalizedJobStatus = normalizeJobStatus(jobId, response.data);
          updateJobStatus(normalizedJobStatus);

          if (normalizedJobStatus.state === "success") {
            stopPolling();

            const resultUrl =
              typeof response.data.result_url === "string"
                ? buildApiUrl(response.data.result_url)
                : null;

            onComplete?.({
              jobId,
              resultUrl,
              status: normalizedJobStatus
            });

            toast.success("Обробку завершено");
            return;
          }

          if (normalizedJobStatus.state === "failed") {
            stopPolling();

            const message = response.error?.message ?? "Обробка завершилась з помилкою";
            onError?.(message);
            toast.error(message);
            return;
          }

          timerIdReference.current = window.setTimeout(tick, pollingIntervalMilliseconds);
        } catch (error) {
          stopPolling();

          const message =
            typeof error === "object" && error && "message" in error
              ? String((error as { message?: string }).message ?? "Polling failed")
              : "Polling failed";

          updateJobStatus({
            jobId,
            state: "failed",
            progress: 100,
            message
          });

          onError?.(message);
          toast.error(message);
        }
      };

      void tick();
    },
    [setJob, stopPolling, updateJobStatus]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    startPolling,
    stopPolling
  };
}