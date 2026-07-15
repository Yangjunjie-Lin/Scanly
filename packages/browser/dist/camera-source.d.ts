import { type ScanFailure, type ScanOutcome } from "@scanly/core";
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
    onResult(outcome: ScanOutcome): void;
    onError?(outcome: ScanFailure): void;
    onStateChange?(state: "starting" | "running" | "stopped"): void;
    onOrientationChange?(): void;
}
export declare class BrowserCameraSource {
    private readonly reader;
    private controls;
    private video;
    private options;
    private startedAt;
    private sequence;
    private readonly recent;
    private visibilityHandler;
    private orientationHandler;
    static listDevices(): Promise<MediaDeviceInfo[]>;
    start(video: HTMLVideoElement, options: CameraStartOptions): Promise<void>;
    switchDevice(deviceId: string): Promise<void>;
    getCapabilities(): CameraCapabilities;
    setTorch(enabled: boolean): Promise<void>;
    setZoom(zoom: number): Promise<void>;
    stop(): void;
    dispose(): void;
    private currentTrack;
    private cleanupStream;
}
//# sourceMappingURL=camera-source.d.ts.map