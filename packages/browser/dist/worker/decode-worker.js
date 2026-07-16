/// <reference lib="webworker" />
import { createBrowserCaptureRouter } from "../runtime.js";
import { fromTransferableFrame } from "./transferable-buffer.js";
import { isWorkerRequest } from "./worker-messages.js";
const router = createBrowserCaptureRouter();
let activeJobId = null;
let activeGeneration = 0;
let activeStartedAt = 0;
let abortController = null;
function respond(message) { self.postMessage(message); }
self.onmessage = async (event) => {
    const message = event.data;
    if (!isWorkerRequest(message)) {
        const jobId = message && typeof message === "object" && "jobId" in message && typeof message.jobId === "string" ? message.jobId : "invalid-message";
        const generation = message && typeof message === "object" && "generation" in message && Number.isSafeInteger(message.generation) ? message.generation : 0;
        respond({ type: "error", jobId, generation, message: "Worker received a malformed request." });
        return;
    }
    if (message.type === "cancel") {
        if (activeJobId === message.jobId && activeGeneration === message.generation) {
            abortController?.abort();
            respond({ type: "cancelled", jobId: message.jobId, generation: message.generation, elapsedMs: Math.max(0, Date.now() - activeStartedAt) });
            activeJobId = null;
            abortController = null;
        }
        return;
    }
    activeJobId = message.jobId;
    activeGeneration = message.generation;
    activeStartedAt = Date.now();
    abortController = new AbortController();
    const signal = abortController.signal;
    try {
        respond({ type: "stage", jobId: message.jobId, generation: message.generation, stage: "Routing normalized frame..." });
        const outcome = await router.scan(fromTransferableFrame(message.frame), { signal, scenario: message.scenario });
        if (activeJobId === message.jobId && activeGeneration === message.generation) {
            if (message.progress)
                respond({ type: "progress", jobId: message.jobId, generation: message.generation, attemptCount: outcome.attemptCount });
            respond({ type: "result", jobId: message.jobId, generation: message.generation, outcome });
        }
    }
    catch (error) {
        if (activeJobId === message.jobId && activeGeneration === message.generation)
            respond({ type: "error", jobId: message.jobId, generation: message.generation, message: (error instanceof Error ? error.message : String(error)).slice(0, 2_048) });
    }
    finally {
        if (activeJobId === message.jobId && activeGeneration === message.generation) {
            activeJobId = null;
            abortController = null;
        }
    }
};
export {};
//# sourceMappingURL=decode-worker.js.map