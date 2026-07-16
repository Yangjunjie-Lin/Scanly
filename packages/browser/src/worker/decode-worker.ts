/// <reference lib="webworker" />

import { createBrowserCaptureRouter } from "../runtime.js";
import { fromTransferableFrame } from "./transferable-buffer.js";
import { isWorkerRequest, type WorkerResponse } from "./worker-messages.js";

const router = createBrowserCaptureRouter();
let activeJobId: string | null = null;
let activeStartedAt = 0;
let abortController: AbortController | null = null;

function respond(message: WorkerResponse): void { self.postMessage(message); }

self.onmessage = async (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isWorkerRequest(message)) {
    const jobId = message && typeof message === "object" && "jobId" in message && typeof message.jobId === "string" ? message.jobId : "invalid-message";
    respond({ type: "error", jobId, message: "Worker received a malformed request." });
    return;
  }
  if (message.type === "cancel") {
    if (activeJobId === message.jobId) {
      abortController?.abort();
      respond({ type: "cancelled", jobId: message.jobId, elapsedMs: Math.max(0, Date.now() - activeStartedAt) });
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
    respond({ type: "stage", jobId: message.jobId, stage: "Routing normalized frame..." });
    const outcome = await router.scan(fromTransferableFrame(message.frame), { signal, scenario: message.scenario });
    if (activeJobId === message.jobId) {
      if (message.progress) respond({ type: "progress", jobId: message.jobId, attemptCount: outcome.attemptCount });
      respond({ type: "result", jobId: message.jobId, outcome });
    }
  } catch (error) {
    if (activeJobId === message.jobId) respond({ type: "error", jobId: message.jobId, message: (error instanceof Error ? error.message : String(error)).slice(0, 2_048) });
  } finally {
    if (activeJobId === message.jobId) { activeJobId = null; abortController = null; }
  }
};

export {};
