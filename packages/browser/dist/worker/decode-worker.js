/// <reference lib="webworker" />
import { decodePixelBuffer } from "@scanly/core/qr";
import { fromTransferable } from "./transferable-buffer.js";
import { isWorkerRequest } from "./worker-messages.js";
let activeJobId = null;
let activeStartedAt = 0;
let abortController = null;
function respond(message) {
    self.postMessage(message);
}
self.onmessage = async (event) => {
    const message = event.data;
    if (!isWorkerRequest(message)) {
        const jobId = message && typeof message === "object" && "jobId" in message && typeof message.jobId === "string" ? message.jobId : "invalid-message";
        respond({ type: "error", jobId, message: "Worker received a malformed request." });
        return;
    }
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
    }
    catch (error) {
        if (activeJobId === message.jobId) {
            respond({
                type: "error",
                jobId: message.jobId,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    finally {
        if (activeJobId === message.jobId) {
            activeJobId = null;
            abortController = null;
        }
    }
};
export {};
//# sourceMappingURL=decode-worker.js.map