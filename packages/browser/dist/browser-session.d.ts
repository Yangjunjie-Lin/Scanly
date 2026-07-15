import { type ConcurrentCallPolicy, type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type DecodePipelineOptions } from "@scanly/core/qr";
import { type DecodeWorkerFactory } from "./worker/worker-client.js";
export type BrowserCaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "disposed";
export interface BrowserScanFileOptions {
    signal?: AbortSignal;
    onStage?: DecodePipelineOptions["onStage"];
    onProgress?: DecodePipelineOptions["onProgress"];
    forceMainThread?: boolean;
}
export interface BrowserCaptureSessionOptions {
    scenario?: ScenarioDefinition;
    concurrentCallPolicy?: ConcurrentCallPolicy;
    workerFactory?: DecodeWorkerFactory;
}
export declare class BrowserCaptureSession {
    private state;
    private scenario;
    private readonly concurrentPolicy;
    private readonly worker;
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
    dispose(): void;
    private assertNotDisposed;
    private failure;
}
//# sourceMappingURL=browser-session.d.ts.map