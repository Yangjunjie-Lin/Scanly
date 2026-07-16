import { type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type SerializedNormalizedFrame } from "./transferable-buffer.js";
export type WorkerRequest = {
    type: "scan";
    jobId: string;
    frame: SerializedNormalizedFrame;
    scenario: ScenarioDefinition;
    progress: boolean;
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
    outcome: ScanOutcome;
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