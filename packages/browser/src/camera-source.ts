import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { createExternalTextOutcome, sdkError, type ScanFailure, type ScanOutcome } from "@scanly/core";
import { getBuiltinScenario, type ScenarioDefinition } from "@scanly/scenario-schema";

export interface CameraCapabilities { torch: boolean; minZoom?: number; maxZoom?: number; currentZoom?: number }
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

function cameraFailure(frameId: string, scenarioId: string, error: unknown): ScanFailure {
  const message = error instanceof Error ? error.message : String(error);
  const code = /NotAllowedError|permission denied/i.test(message) ? "camera_permission_denied" : /NotFoundError|DevicesNotFound|Requested device not found|no.*device/i.test(message) ? "camera_unavailable" : "source_disconnected";
  return { ok: false, error: sdkError(code, message), frameId, scenarioId, attemptCount: 0, timing: { totalMs: 0 } };
}

export class BrowserCameraSource {
  private readonly reader = new BrowserQRCodeReader();
  private controls: IScannerControls | null = null;
  private video: HTMLVideoElement | null = null;
  private options: CameraStartOptions | null = null;
  private startedAt = 0;
  private sequence = 0;
  private readonly recent = new Map<string, number>();
  private visibilityHandler: (() => void) | null = null;
  private orientationHandler: (() => void) | null = null;

  static listDevices(): Promise<MediaDeviceInfo[]> { return BrowserQRCodeReader.listVideoInputDevices(); }

  async start(video: HTMLVideoElement, options: CameraStartOptions): Promise<void> {
    this.stop();
    this.video = video;
    this.options = options;
    this.startedAt = Date.now();
    options.onStateChange?.("starting");
    if (options.stopWhenPageHidden !== false && typeof document !== "undefined") {
      this.visibilityHandler = () => { if (document.visibilityState === "hidden") this.stop(); };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    if (typeof window !== "undefined") {
      this.orientationHandler = () => this.options?.onOrientationChange?.();
      window.addEventListener("orientationchange", this.orientationHandler);
    }
    try {
      this.controls = await this.reader.decodeFromVideoDevice(options.deviceId, video, (result, error, controls) => {
        if (result) {
          const text = result.getText();
          const now = Date.now();
          const last = this.recent.get(text) ?? 0;
          if (now - last >= (options.duplicateWindowMs ?? 1_500)) {
            this.recent.set(text, now);
            const scenario = options.scenario ?? getBuiltinScenario("balanced");
            options.onResult(createExternalTextOutcome(`camera-frame-${++this.sequence}-${now}`, scenario, text, { id: "zxing-browser", version: "0.1.5" }, now - this.startedAt));
          }
          if (options.stopAfterResult !== false) { controls.stop(); this.cleanupStream(); this.controls = null; options.onStateChange?.("stopped"); }
        } else if (error && /NotAllowedError|NotFoundError|DevicesNotFound|Requested device not found/i.test(String(error))) {
          const failure = cameraFailure(`camera-frame-${++this.sequence}-${Date.now()}`, (options.scenario ?? getBuiltinScenario("balanced")).id, error);
          options.onError?.(failure);
        }
      });
      options.onStateChange?.("running");
    } catch (error) {
      const failure = cameraFailure(`camera-frame-${++this.sequence}-${Date.now()}`, (options.scenario ?? getBuiltinScenario("balanced")).id, error);
      options.onError?.(failure);
      this.stop();
      throw error;
    }
  }

  async switchDevice(deviceId: string): Promise<void> {
    if (!this.video || !this.options) throw new Error("Camera source is not started.");
    const video = this.video;
    const options = { ...this.options, deviceId };
    await this.start(video, options);
  }

  getCapabilities(): CameraCapabilities {
    const track = this.currentTrack();
    const capabilities = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean; zoom?: { min?: number; max?: number } } | undefined;
    const settings = track?.getSettings?.() as MediaTrackSettings & { zoom?: number } | undefined;
    return { torch: Boolean(capabilities?.torch), minZoom: capabilities?.zoom?.min, maxZoom: capabilities?.zoom?.max, currentZoom: settings?.zoom };
  }

  async setTorch(enabled: boolean): Promise<void> {
    const track = this.currentTrack();
    if (!track || !this.getCapabilities().torch) throw new Error("Torch is not supported by the active camera track.");
    await track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] });
  }

  async setZoom(zoom: number): Promise<void> {
    const track = this.currentTrack();
    const capabilities = this.getCapabilities();
    if (!track || capabilities.minZoom === undefined || capabilities.maxZoom === undefined) throw new Error("Zoom is not supported by the active camera track.");
    if (zoom < capabilities.minZoom || zoom > capabilities.maxZoom) throw new RangeError(`Zoom must be between ${capabilities.minZoom} and ${capabilities.maxZoom}.`);
    await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
  }

  stop(): void {
    try { this.controls?.stop(); } catch { /* already stopped */ }
    this.controls = null;
    this.cleanupStream();
    if (this.visibilityHandler && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibilityHandler);
    if (this.orientationHandler && typeof window !== "undefined") window.removeEventListener("orientationchange", this.orientationHandler);
    this.visibilityHandler = null;
    this.orientationHandler = null;
    this.options?.onStateChange?.("stopped");
    this.video = null;
    this.options = null;
    this.recent.clear();
  }

  dispose(): void { this.stop(); }
  private currentTrack(): MediaStreamTrack | undefined { return typeof MediaStream !== "undefined" && this.video?.srcObject instanceof MediaStream ? this.video.srcObject.getVideoTracks()[0] : undefined; }
  private cleanupStream(): void {
    if (typeof MediaStream !== "undefined" && this.video?.srcObject instanceof MediaStream) {
      for (const track of this.video.srcObject.getTracks()) track.stop();
      this.video.srcObject = null;
    }
  }
}
