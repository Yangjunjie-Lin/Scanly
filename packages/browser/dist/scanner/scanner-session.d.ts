import { CaptureRouter, type NormalizedFrame, type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type DecodeWorkerFactory } from "../worker/worker-client.js";
import { CameraCapabilityController } from "./camera-capabilities.js";
import { BoundedDecodeEscalation } from "./decode-escalation.js";
import { type FrameQualityAnalyzerOptions } from "./frame-quality.js";
import { type FrameSchedulerOptions } from "./frame-scheduler.js";
import { type TemporalCandidateStoreOptions } from "./temporal-confirmation.js";
import { type TemporalROIOptions } from "./temporal-roi.js";
import type { AutoZoomOptions, CameraCapabilities, CameraFrameSource, CapabilityResult, RepeatPolicy, ScannerDecodeRequest, ScannerDiagnosticListener, ScannerFrameDecoder, ScannerSessionStatistics, ScannerSessionState, ScannerStateListener, ScanResultListener, Unsubscribe } from "./types.js";
export interface BrowserScannerFrameDecoderOptions {
    router?: CaptureRouter;
    workerFactory?: DecodeWorkerFactory;
    useWorker?: boolean;
    disposeRouter?: boolean;
    scenario?: ScenarioDefinition;
}
/** Default decoder composition: persistent Worker with an explicit main-thread fallback. */
export declare class BrowserScannerFrameDecoder implements ScannerFrameDecoder {
    private readonly router;
    private readonly ownsRouter;
    private readonly worker;
    private readonly useWorker;
    private readonly baseScenario?;
    private disposed;
    constructor(options?: BrowserScannerFrameDecoderOptions);
    decode(frame: NormalizedFrame, request: ScannerDecodeRequest): Promise<ScanOutcome>;
    cancel(): void;
    dispose(): Promise<void>;
    getStatistics(): {
        wasmInputAllocationBytes: number;
        wasmActiveNativeResultCount: number;
        wasmCurrentLinearMemoryBytes: number;
        wasmPeakLinearMemoryBytes: number;
        wasmReleasedNativeResultCount: number;
        workerCreatedCount: number;
        workerTerminatedCount: number;
        activeTaskCount: number;
        peakActiveTaskCount: number;
        wasmObservationCount: number;
        workerWasmDecodeCount: number;
    };
}
export interface ScannerSessionOptions {
    source: CameraFrameSource;
    decoder?: ScannerFrameDecoder;
    decoderOptions?: BrowserScannerFrameDecoderOptions;
    confirmation?: TemporalCandidateStoreOptions;
    repeatPolicy?: RepeatPolicy;
    quality?: FrameQualityAnalyzerOptions;
    qualityProbeInterval?: number;
    scheduler?: FrameSchedulerOptions;
    escalation?: ConstructorParameters<typeof BoundedDecodeEscalation>[0];
    roi?: TemporalROIOptions;
    capabilityController?: CameraCapabilityController;
    autoZoom?: AutoZoomOptions;
}
export declare class ScannerSession {
    private state;
    private source;
    private readonly decoder;
    private readonly ownsDecoder;
    private readonly quality;
    private readonly scheduler;
    private readonly escalation;
    private readonly candidates;
    private readonly repeats;
    private readonly roi;
    private capabilityController?;
    private readonly autoZoom?;
    private readonly qualityProbeInterval;
    private readonly resultListeners;
    private readonly stateListeners;
    private readonly diagnosticListeners;
    private generation;
    private lifecycleGeneration;
    private stopPromise;
    private activeDecodeController;
    private frameSequence;
    private eventSequence;
    private startedAt;
    private firstDecodeAt?;
    private firstConfirmedAt?;
    private decodeLatencies;
    private peakControlledMemory;
    private currentWorkerMemory;
    private counters;
    constructor(options: ScannerSessionOptions);
    getState(): ScannerSessionState;
    start(): Promise<void>;
    pause(): void;
    resume(): void;
    switchSource(source: CameraFrameSource, capabilityController?: CameraCapabilityController): Promise<void>;
    stop(): Promise<void>;
    reset(): void;
    dispose(): Promise<void>;
    getStatistics(): ScannerSessionStatistics;
    onResult(listener: ScanResultListener): Unsubscribe;
    onStateChange(listener: ScannerStateListener): Unsubscribe;
    onDiagnostics(listener: ScannerDiagnosticListener): Unsubscribe;
    getCameraCapabilities(): CameraCapabilities;
    setTorch(enabled: boolean): Promise<CapabilityResult<boolean>>;
    setZoom(value: number, manual?: boolean): Promise<CapabilityResult<number>>;
    requestFocus(): Promise<CapabilityResult<boolean>>;
    private acceptFrame;
    private processFrame;
    private observeResult;
    private emitLost;
    private event;
    private canPublishGeneration;
    private emitQualityHint;
    private handleSourceEnded;
    private handleSourceError;
    private setState;
    private emitDiagnostic;
}
//# sourceMappingURL=scanner-session.d.ts.map