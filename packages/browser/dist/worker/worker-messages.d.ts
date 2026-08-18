import { type RecoveryBudget, type RecoveryProfile, type RecoveryRouteId, type RecoverySourceMode, type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type SerializedNormalizedFrame } from "./transferable-buffer.js";
export interface WorkerRecoveryRequest {
    profile: RecoveryProfile;
    sourceMode: RecoverySourceMode;
    budget?: RecoveryBudget;
    dpmExperimental: boolean;
    excludedRoutes?: RecoveryRouteId[];
}
export type WorkerRequest = {
    type: "scan";
    jobId: string;
    generation: number;
    frame: SerializedNormalizedFrame;
    scenario: ScenarioDefinition;
    progress: boolean;
    recovery?: WorkerRecoveryRequest;
} | {
    type: "cancel";
    jobId: string;
    generation: number;
};
/** Live ZXing-C++ resources observed inside the Worker realm after a decode. */
export interface WorkerWasmMemoryObservation {
    initialLinearMemoryBytes: number;
    currentLinearMemoryBytes: number;
    peakLinearMemoryBytes: number;
    inputAllocationBytes: number;
    peakInputAllocationBytes: number;
    activeNativeResultCount: number;
    releasedNativeResultCount: number;
}
export interface WorkerRecoveryObservation {
    attemptCount: number;
    processedPixels: number;
    currentTemporaryBytes: number;
    peakTemporaryBytes: number;
    activeBuffers: number;
    routeStateCount: number;
    attemptedRoutes: RecoveryRouteId[];
    successfulRoute?: RecoveryRouteId;
    insufficientEvidence: boolean;
}
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
    wasmMemory?: WorkerWasmMemoryObservation;
    recovery?: WorkerRecoveryObservation;
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