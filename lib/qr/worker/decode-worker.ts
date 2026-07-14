/// <reference lib="webworker" />

import { decodePixelBuffer } from "../decode-pipeline";
import { fromTransferable } from "./transferable-buffer";
import type { WorkerRequest, WorkerResponse } from "./worker-messages";

let activeJobId: string | null = null;
let activeStartedAt = 0;
let abortController: AbortController | null = null;

function respond(message: WorkerResponse): void {
  self.postMessage(message);
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "cancel") {
    if (activeJobId === message.jobId) {
      abortController?.abort();
      respond({
        type: "cancelled",
        jobId: message.jobId,
        elapsedMs: Math.max(0, Date.now() - activeStartedAt),
      });
      activeJobId = null;
      abortController = null;
    }
    return;
  }

  activeJobId = message.jobId;
  activeStartedAt = Date.now();
  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    const outcome = await decodePixelBuffer(fromTransferable(message.pixels), {
      signal,
      config: message.config,
      onStage: (stage) => {
        if (activeJobId === message.jobId) {
          respond({ type: "stage", jobId: message.jobId, stage });
        }
      },
      onProgress: ({ attemptCount }) => {
        if (activeJobId === message.jobId) {
          respond({ type: "progress", jobId: message.jobId, attemptCount });
        }
      },
    });

    if (activeJobId === message.jobId) {
      respond({ type: "result", jobId: message.jobId, outcome });
    }
  } catch (error) {
    if (activeJobId === message.jobId) {
      respond({
        type: "error",
        jobId: message.jobId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    if (activeJobId === message.jobId) {
      activeJobId = null;
      abortController = null;
    }
  }
};

export {};
