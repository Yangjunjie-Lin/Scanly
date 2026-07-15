import type { DecodeOutcome, PipelineConfig } from "@scanly/core/qr";
import type { SerializedPixelBuffer } from "./transferable-buffer.js";
export type WorkerRequest = {
    type: "decode";
    jobId: string;
    pixels: SerializedPixelBuffer;
    config?: Partial<PipelineConfig>;
} | {
    type: "cancel";
    jobId: string;
};
export type WorkerResponse = {
    type: "stage";
    jobId: string;
    stage: string;
} | {
    type: "progress";
    jobId: string;
    attemptCount: number;
} | {
    type: "result";
    jobId: string;
    outcome: DecodeOutcome;
} | {
    type: "cancelled";
    jobId: string;
    elapsedMs: number;
} | {
    type: "error";
    jobId: string;
    message: string;
};
export declare function isWorkerRequest(value: unknown): value is WorkerRequest;
export declare function isWorkerResponse(value: unknown): value is WorkerResponse;
//# sourceMappingURL=worker-messages.d.ts.map