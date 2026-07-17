import { type ScenarioDefinition } from "@scanly/scenario-schema";
import type { FrameSourceType, NormalizedFrame } from "../contracts/frame.js";
import type { ScanOutcome } from "../contracts/result.js";
import { CaptureRouter } from "./router.js";
export type CaptureSessionState = "idle" | "initialized" | "running" | "stopped" | "error" | "disposed";
export type ConcurrentCallPolicy = "replace" | "reject";
export interface CaptureSessionOptions {
    router?: CaptureRouter;
    scenario?: ScenarioDefinition;
    concurrentCallPolicy?: ConcurrentCallPolicy;
    disposeRouter?: boolean;
    applyDuplicateSuppression?: boolean;
}
export declare class CaptureSession {
    private state;
    private readonly router;
    private readonly concurrentPolicy;
    private activeController;
    private ownership;
    private source;
    private readonly ownsRouter;
    private duplicatePolicy;
    private readonly applyDuplicateSuppression;
    constructor(options?: CaptureSessionOptions);
    getState(): CaptureSessionState;
    getSource(): FrameSourceType | null;
    initialize(): void;
    start(source?: FrameSourceType): void;
    stop(): void;
    cancel(): void;
    updateConfiguration(scenario: ScenarioDefinition): void;
    switchSource(source: FrameSourceType): void;
    scan(frame: NormalizedFrame, options?: {
        signal?: AbortSignal;
    }): Promise<ScanOutcome>;
    dispose(): Promise<void>;
    private assertNotDisposed;
    private lifecycleFailure;
}
//# sourceMappingURL=session.d.ts.map