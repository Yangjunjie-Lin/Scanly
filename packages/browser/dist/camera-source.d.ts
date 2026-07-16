import { type CaptureRouter, type ScanFailure, type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type DecodeWorkerFactory } from "./worker/worker-client.js";
import { type CameraEscalationOptions } from "./camera-strategy.js";
export interface CameraCapabilities {
    torch: boolean;
    minZoom?: number;
    maxZoom?: number;
    currentZoom?: number;
    focusModes?: string[];
    width?: number;
    height?: number;
}
export interface CameraStartOptions {
    deviceId?: string;
    facingMode?: "user" | "environment";
    preferredWidth?: number;
    preferredHeight?: number;
    scenario?: ScenarioDefinition;
    stopAfterResult?: boolean;
    duplicateWindowMs?: number;
    stopWhenPageHidden?: boolean;
    frameCadenceMs?: number;
    stableResultCount?: number;
    /** Longest sampled RGBA side before Canvas readback. Defaults to 960. */
    sampleMaxSide?: number;
    forceMainThread?: boolean;
    escalation?: CameraEscalationOptions;
    maximumConsecutiveWorkerRestarts?: number;
    workerRestartBaseDelayFrames?: number;
    onResult(outcome: ScanOutcome): void;
    onError?(outcome: ScanFailure): void;
    onStateChange?(state: "starting" | "running" | "stopped"): void;
    onOrientationChange?(): void;
}
export interface BrowserCameraSourceOptions {
    router?: CaptureRouter;
    disposeRouter?: boolean;
    workerFactory?: DecodeWorkerFactory;
}
/** Default SDK v2 camera path: sampled RGBA frames -> CaptureSession -> CaptureRouter. */
export declare class BrowserCameraSource {
    private readonly session;
    private readonly worker;
    private video;
    private options;
    private canvas;
    private timer;
    private videoFrameCallbackId;
    private activeFrame;
    private sequence;
    private generation;
    private visibilityHandler;
    private orientationHandler;
    private trackEndedHandler;
    private duplicatePolicy;
    private stableKey;
    private stableCount;
    private stopped;
    private workerAvailable;
    private workerRetryFrames;
    private consecutiveWorkerRestarts;
    private sampledVideoWidth;
    private sampledVideoHeight;
    private strategy;
    constructor(options?: BrowserCameraSourceOptions);
    static listDevices(): Promise<MediaDeviceInfo[]>;
    start(video: HTMLVideoElement, options: CameraStartOptions): Promise<void>;
    switchDevice(deviceId: string): Promise<void>;
    getCapabilities(): CameraCapabilities;
    setTorch(enabled: boolean): Promise<void>;
    setZoom(zoom: number): Promise<void>;
    stop(): void;
    dispose(): Promise<void>;
    private schedule;
    private sample;
    private handleResult;
    private handleSourceError;
    private installListeners;
    private internalStop;
    private currentTrack;
}
//# sourceMappingURL=camera-source.d.ts.map