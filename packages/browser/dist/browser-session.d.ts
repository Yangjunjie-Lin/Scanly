import { CaptureRouter, type ConcurrentCallPolicy, type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type DecodeWorkerFactory, type WorkerScanOptions } from "./worker/worker-client.js";
export type BrowserCaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "disposed";
export interface BrowserScanFileOptions extends WorkerScanOptions {
    forceMainThread?: boolean;
}
export interface BrowserCaptureSessionOptions {
    scenario?: ScenarioDefinition;
    concurrentCallPolicy?: ConcurrentCallPolicy;
    workerFactory?: DecodeWorkerFactory;
    router?: CaptureRouter;
    disposeRouter?: boolean;
}
export declare class BrowserCaptureSession {
    private state;
    private scenario;
    private readonly concurrentPolicy;
    private readonly worker;
    private readonly router;
    private readonly ownsRouter;
    private controller;
    private owner;
    constructor(options?: BrowserCaptureSessionOptions);
    getState(): BrowserCaptureSessionState;
    initialize(): void;
    start(): void;
    stop(): void;
    cancel(): void;
    updateConfiguration(scenario: ScenarioDefinition): void;
    scanFile(file: File, options?: BrowserScanFileOptions): Promise<ScanOutcome>;
    dispose(): Promise<void>;
    private assertNotDisposed;
    private failure;
}
//# sourceMappingURL=browser-session.d.ts.map