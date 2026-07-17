import { type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type SerializedNormalizedFrame } from "./transferable-buffer.js";
export type WorkerRequest = {
    type: "scan";
    jobId: string;
    generation: number;
    frame: SerializedNormalizedFrame;
    scenario: ScenarioDefinition;
    progress: boolean;
} | {
    type: "cancel";
    jobId: string;
    generation: number;
};
export type WorkerResponse = {
    type: "stage";
    jobId: string;
    generation: number;
    stage: string;
} | {
    type: "progress";
    jobId: string;
    generation: number;
    attemptCount: number;
} | {
    type: "result";
    jobId: string;
    generation: number;
    outcome: ScanOutcome;
} | {
    type: "cancelled";
    jobId: string;
    generation: number;
    elapsedMs: number;
} | {
    type: "error";
    jobId: string;
    generation: number;
    message: string;
};
export declare function isWorkerRequest(value: unknown): value is WorkerRequest;
export declare function isWorkerResponse(value: unknown): value is WorkerResponse;
//# sourceMappingURL=worker-messages.d.ts.map