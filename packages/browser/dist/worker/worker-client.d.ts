import { type NormalizedFrame, type ScanOutcome } from "@scanly/core";
import type { ScenarioDefinition } from "@scanly/scenario-schema";
import { type WorkerRequest, type WorkerResponse } from "./worker-messages.js";
export interface DecodeWorkerLike {
    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
    terminate(): void;
}
export type DecodeWorkerFactory = () => DecodeWorkerLike;
export interface WorkerScanOptions {
    signal?: AbortSignal;
    generation?: number;
    preserveSourceForFallback?: boolean;
    onStage?: (stage: string) => void;
    onProgress?: (progress: {
        attemptCount: number;
    }) => void;
}
type WorkerDebugState = {
    created: number;
    terminated: number;
    decodePosted: number;
    workerDecodeCount: number;
    mainThreadDecodeCount: number;
    workerDegraded: boolean;
    workerRestartCount: number;
    lastPath: "worker" | "main-thread" | null;
};
declare global {
    interface Window {
        __SCANLY_WORKER_DEBUG__?: WorkerDebugState;
    }
}
export declare function markDecodePath(path: WorkerDebugState["lastPath"]): void;
export declare function markWorkerRecovery(degraded: boolean, restarts: number): void;
export declare function getDecodeWorkerClient(): DecodeWorkerClient;
export declare function resetDecodeWorkerClientForTests(): void;
export declare function disposeDecodeWorkerClient(): void;
export declare class DecodeWorkerClient {
    private readonly workerFactory;
    private worker;
    private currentJobId;
    private pending;
    private seq;
    constructor(workerFactory?: DecodeWorkerFactory);
    private ensureWorker;
    private handleMessage;
    private handleWorkerError;
    private finish;
    private restartWorker;
    scan(frame: NormalizedFrame, scenario: ScenarioDefinition, options?: WorkerScanOptions): Promise<ScanOutcome>;
    cancel(): void;
    dispose(): void;
}
export {};
//# sourceMappingURL=worker-client.d.ts.map