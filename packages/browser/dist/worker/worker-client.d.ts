import type { DecodeOutcome, DecodePipelineOptions, PixelBuffer } from "@scanly/core/qr";
import { type WorkerRequest, type WorkerResponse } from "./worker-messages.js";
export interface DecodeWorkerLike {
    onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
    terminate(): void;
}
export type DecodeWorkerFactory = () => DecodeWorkerLike;
type WorkerDebugState = {
    created: number;
    terminated: number;
    decodePosted: number;
    lastPath: "worker" | "main-thread" | null;
};
declare global {
    interface Window {
        __SCANLY_WORKER_DEBUG__?: WorkerDebugState;
    }
}
export declare function markDecodePath(path: WorkerDebugState["lastPath"]): void;
export declare function getDecodeWorkerClient(): DecodeWorkerClient;
/** Test hook: reset singleton between tests. */
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
    private timingFor;
    private noteFirstMessage;
    private handleMessage;
    private handleWorkerError;
    private finish;
    private restartWorker;
    decode(buffer: PixelBuffer, options?: DecodePipelineOptions): Promise<DecodeOutcome>;
    /** Cancel the active job, settle its promise, and recreate the worker lazily. */
    cancel(): void;
    dispose(): void;
}
export {};
//# sourceMappingURL=worker-client.d.ts.map