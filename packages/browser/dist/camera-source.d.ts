import { type CaptureRouter, type ScanFailure, type ScanOutcome } from "@scanly/core";
import { type ScenarioDefinition } from "@scanly/scenario-schema";
export interface CameraCapabilities {
    torch: boolean;
    minZoom?: number;
    maxZoom?: number;
    currentZoom?: number;
}
export interface CameraStartOptions {
    deviceId?: string;
    scenario?: ScenarioDefinition;
    stopAfterResult?: boolean;
    duplicateWindowMs?: number;
    stopWhenPageHidden?: boolean;
    frameCadenceMs?: number;
    stableResultCount?: number;
    /** Longest sampled RGBA side before Canvas readback. Defaults to 960. */
    sampleMaxSide?: number;
    onResult(outcome: ScanOutcome): void;
    onError?(outcome: ScanFailure): void;
    onStateChange?(state: "starting" | "running" | "stopped"): void;
    onOrientationChange?(): void;
}
export interface BrowserCameraSourceOptions {
    router?: CaptureRouter;
    disposeRouter?: boolean;
}
/** Default SDK v2 camera path: sampled RGBA frames -> CaptureSession -> CaptureRouter. */
export declare class BrowserCameraSource {
    private readonly session;
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