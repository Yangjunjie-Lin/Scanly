import {
  CaptureSession,
  DuplicateSuppressionPolicy,
  createRgbaFrame,
  sdkError,
  type CaptureRouter,
  type ScanFailure,
  type ScanOutcome,
} from "@scanly/core";
import { getBuiltinScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { createBrowserCaptureRouter } from "./runtime.js";

export interface CameraCapabilities { torch: boolean; minZoom?: number; maxZoom?: number; currentZoom?: number }
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

export interface BrowserCameraSourceOptions { router?: CaptureRouter; disposeRouter?: boolean }

function cameraFailure(frameId: string, scenarioId: string, error: unknown): ScanFailure {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_048);
  const code = /NotAllowedError|permission denied/i.test(message) ? "camera_permission_denied" : /NotFoundError|DevicesNotFound|Requested device not found|no.*device/i.test(message) ? "camera_unavailable" : "source_disconnected";
  return { ok: false, error: sdkError(code, message), frameId, scenarioId, attemptCount: 0, timing: { totalMs: 0 } };
}

function orientation(): 0 | 90 | 180 | 270 {
  const angle = typeof screen !== "undefined" ? screen.orientation?.angle ?? 0 : 0;
  const normalized = ((angle % 360) + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

/** Default SDK v2 camera path: sampled RGBA frames -> CaptureSession -> CaptureRouter. */
export class BrowserCameraSource {
  private readonly session: CaptureSession;
  private video: HTMLVideoElement | null = null;
  private options: CameraStartOptions | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private videoFrameCallbackId: number | null = null;
  private activeFrame = false;
  private sequence = 0;
  private generation = 0;
  private visibilityHandler: (() => void) | null = null;
  private orientationHandler: (() => void) | null = null;
  private trackEndedHandler: (() => void) | null = null;
  private duplicatePolicy = new DuplicateSuppressionPolicy(1_500);
  private stableKey: string | null = null;
  private stableCount = 0;
  private stopped = true;

  constructor(options: BrowserCameraSourceOptions = {}) {
    const router = options.router ?? createBrowserCaptureRouter();
    this.session = new CaptureSession({ router, disposeRouter: options.disposeRouter ?? !options.router, concurrentCallPolicy: "reject", applyDuplicateSuppression: false });
  }

  static async listDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  }

  async start(video: HTMLVideoElement, options: CameraStartOptions): Promise<void> {
    this.stop();
    const scenario = options.scenario ?? getBuiltinScenario("fast");
    this.generation += 1;
    const generation = this.generation;
    this.stopped = false;
    this.video = video;
    this.options = options;
    this.duplicatePolicy = new DuplicateSuppressionPolicy(options.duplicateWindowMs ?? (scenario.duplicateSuppression.enabled ? scenario.duplicateSuppression.windowMs : 0));
    options.onStateChange?.("starting");
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is not supported by this browser.");
      this.session.updateConfiguration(scenario);
      this.session.start("camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: options.deviceId ? { deviceId: { exact: options.deviceId } } : { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (generation !== this.generation || this.stopped) { for (const track of stream.getTracks()) track.stop(); return; }
      video.srcObject = stream;
      await video.play();
      if (generation !== this.generation || this.stopped) { for (const track of stream.getTracks()) track.stop(); return; }
      this.canvas = document.createElement("canvas");
      this.installListeners();
      const track = stream.getVideoTracks()[0];
      if (track) {
        this.trackEndedHandler = () => this.handleSourceError(new Error("Camera track ended."));
        track.addEventListener?.("ended", this.trackEndedHandler);
      }
      options.onStateChange?.("running");
      this.schedule(generation, 0);
    } catch (error) {
      if (generation !== this.generation || this.stopped) return;
      const failure = cameraFailure(`camera-frame-${++this.sequence}-${Date.now()}`, scenario.id, error);
      options.onError?.(failure);
      this.internalStop(true);
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

  stop(): void { this.internalStop(true); }

  async dispose(): Promise<void> {
    this.internalStop(true);
    await this.session.dispose();
  }

  private schedule(generation: number, delay?: number): void {
    if (this.stopped || generation !== this.generation) return;
    const videoWithFrames = this.video as (HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    }) | null;
    if (videoWithFrames?.requestVideoFrameCallback && delay === undefined) {
      this.videoFrameCallbackId = videoWithFrames.requestVideoFrameCallback(() => {
        this.videoFrameCallbackId = null;
        void this.sample(generation);
      });
      return;
    }
    const cadence = Math.max(50, Math.min(5_000, this.options?.frameCadenceMs ?? 200));
    this.timer = setTimeout(() => void this.sample(generation), delay ?? cadence);
  }

  private async sample(generation: number): Promise<void> {
    if (this.stopped || generation !== this.generation) return;
    if (this.activeFrame) { this.schedule(generation); return; }
    const video = this.video;
    const canvas = this.canvas;
    if (!video || !canvas || video.videoWidth < 1 || video.videoHeight < 1) { this.schedule(generation); return; }
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) { this.handleSourceError(new Error("Canvas 2D frame adapter is unavailable.")); return; }
    this.activeFrame = true;
    try {
      const maxSide = Math.max(320, Math.min(2_048, this.options?.sampleMaxSide ?? 960));
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const track = this.currentTrack();
      const settings = track?.getSettings?.();
      const now = Date.now();
      const frame = createRgbaFrame(image.data, image.width, image.height, {
        id: `camera-frame-${++this.sequence}-${now}`,
        timestampMs: now,
        sourceType: "camera",
        ownership: "owned",
        orientation: orientation(),
        device: { deviceId: settings?.deviceId, facingMode: settings?.facingMode as "user" | "environment" | "left" | "right" | undefined },
      });
      const outcome = await this.session.scan(frame);
      if (this.stopped || generation !== this.generation) return;
      if (outcome.ok) this.handleResult(outcome);
      else if (!["no_symbol_found", "timeout", "cancelled"].includes(outcome.error.code)) this.options?.onError?.(outcome);
    } catch (error) {
      if (!this.stopped && generation === this.generation) this.handleSourceError(error);
    } finally {
      this.activeFrame = false;
      this.schedule(generation);
    }
  }

  private handleResult(outcome: ScanOutcome & { ok: true }): void {
    const key = outcome.results.map((result) => `${result.format}\u001f${result.rawText}`).sort().join("\u001e");
    if (key === this.stableKey) this.stableCount += 1;
    else { this.stableKey = key; this.stableCount = 1; }
    if (this.stableCount < Math.max(1, Math.min(10, this.options?.stableResultCount ?? 1))) return;
    const filtered = this.duplicatePolicy.filter(outcome);
    if (!filtered.ok) return;
    this.options?.onResult(filtered);
    if (this.options?.stopAfterResult !== false) this.internalStop(true);
  }

  private handleSourceError(error: unknown): void {
    const options = this.options;
    const scenarioId = (options?.scenario ?? getBuiltinScenario("fast")).id;
    options?.onError?.(cameraFailure(`camera-frame-${++this.sequence}-${Date.now()}`, scenarioId, error));
    this.internalStop(true);
  }

  private installListeners(): void {
    if (this.options?.stopWhenPageHidden !== false && typeof document !== "undefined") {
      this.visibilityHandler = () => { if (document.visibilityState === "hidden") this.internalStop(true); };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    if (typeof window !== "undefined") {
      this.orientationHandler = () => this.options?.onOrientationChange?.();
      window.addEventListener("orientationchange", this.orientationHandler);
    }
  }

  private internalStop(notify: boolean): void {
    if (this.stopped && !this.video && !this.options) return;
    const options = this.options;
    this.stopped = true;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const videoWithFrames = this.video as (HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }) | null;
    if (this.videoFrameCallbackId !== null) videoWithFrames?.cancelVideoFrameCallback?.(this.videoFrameCallbackId);
    this.videoFrameCallbackId = null;
    this.session.stop();
    const track = this.currentTrack();
    if (track && this.trackEndedHandler) track.removeEventListener?.("ended", this.trackEndedHandler);
    this.trackEndedHandler = null;
    if (this.video?.srcObject instanceof MediaStream) for (const streamTrack of this.video.srcObject.getTracks()) streamTrack.stop();
    if (this.video) this.video.srcObject = null;
    if (this.visibilityHandler && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibilityHandler);
    if (this.orientationHandler && typeof window !== "undefined") window.removeEventListener("orientationchange", this.orientationHandler);
    this.visibilityHandler = null;
    this.orientationHandler = null;
    this.duplicatePolicy.clear();
    this.stableKey = null;
    this.stableCount = 0;
    this.activeFrame = false;
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; }
    this.canvas = null;
    this.video = null;
    this.options = null;
    if (notify) options?.onStateChange?.("stopped");
  }

  private currentTrack(): MediaStreamTrack | undefined {
    return typeof MediaStream !== "undefined" && this.video?.srcObject instanceof MediaStream ? this.video.srcObject.getVideoTracks()[0] : undefined;
  }
}
