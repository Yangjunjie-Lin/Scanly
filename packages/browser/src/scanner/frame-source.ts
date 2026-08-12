import { createRgbaFrame, type NormalizedFrame } from "@scanly/core";
import type { CameraFrameSource } from "./types.js";
import {
  diagnosticsForTrack,
  negotiateCameraStream,
  type CameraConstraintPolicy,
  type CameraLifecycleEvent,
  type DeviceDiagnostics,
} from "./camera-platform.js";

export type DeterministicFrameFactory = () => Iterable<NormalizedFrame> | AsyncIterable<NormalizedFrame>;
export interface DeterministicFrameSequenceSourceOptions { respectBackpressure?: boolean }

/** CI camera simulator source. It awaits consumer backpressure and never touches mediaDevices. */
export class DeterministicFrameSequenceSource implements CameraFrameSource {
  private stopped = true;
  private paused = false;
  private pauseWaiters = new Set<() => void>();
  private finishedPromise: Promise<void> = Promise.resolve();
  private finish!: () => void;

  constructor(private readonly frames: DeterministicFrameFactory, private readonly options: DeterministicFrameSequenceSourceOptions = {}) {}

  async start(onFrame: (frame: NormalizedFrame) => Promise<void> | void, onError: (error: unknown) => void, onEnded: () => void): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.paused = false;
    this.finishedPromise = new Promise<void>((resolve) => { this.finish = resolve; });
    queueMicrotask(() => { void this.pump(onFrame, onError, onEnded); });
  }

  pause(): void { if (!this.stopped) this.paused = true; }
  resume(): void { this.paused = false; for (const resolve of this.pauseWaiters) resolve(); this.pauseWaiters.clear(); }
  async stop(): Promise<void> { this.stopped = true; this.resume(); await this.finishedPromise; }
  async finished(): Promise<void> { await this.finishedPromise; }

  private async pump(onFrame: (frame: NormalizedFrame) => Promise<void> | void, onError: (error: unknown) => void, onEnded: () => void): Promise<void> {
    const inFlight: Promise<void>[] = [];
    try {
      const sequence = this.frames();
      if (this.options.respectBackpressure === false && Symbol.iterator in sequence) {
        for (const frame of sequence) {
          if (this.stopped) { if (frame.ownership !== "borrowed") frame.dispose?.(); break; }
          inFlight.push(Promise.resolve(onFrame(frame)));
        }
      } else {
        for await (const frame of sequence) {
          if (this.stopped) { if (frame.ownership !== "borrowed") frame.dispose?.(); break; }
          if (this.paused) await new Promise<void>((resolve) => this.pauseWaiters.add(resolve));
          if (this.stopped) { if (frame.ownership !== "borrowed") frame.dispose?.(); break; }
          await onFrame(frame);
        }
      }
      await Promise.all(inFlight);
      if (!this.stopped) onEnded();
    } catch (error) { if (!this.stopped) onError(error); }
    finally { this.stopped = true; this.finish?.(); }
  }
}

export interface MediaStreamCameraFrameSourceOptions {
  video: HTMLVideoElement;
  deviceId?: string;
  facingMode?: "user" | "environment";
  preferredWidth?: number;
  preferredHeight?: number;
  preferredFrameRate?: number;
  exactDevice?: boolean;
  maximumConstraintAttempts?: number;
  sampleMaxSide?: number;
  fallbackCadenceMs?: number;
  stopWhenPageHidden?: boolean;
}

/** Browser media adapter only: camera acquisition and RGBA sampling, with no scanner policy state. */
export class MediaStreamCameraFrameSource implements CameraFrameSource {
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private callbackId: number | null = null;
  private sequence = 0;
  private stopped = true;
  private paused = false;
  private onFrame: ((frame: NormalizedFrame) => Promise<void> | void) | null = null;
  private onError: ((error: unknown) => void) | null = null;
  private onEnded: (() => void) | null = null;
  private endedHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private orientationHandler: (() => void) | null = null;
  private onLifecycle: ((event: CameraLifecycleEvent) => void) | null = null;
  private diagnostics: DeviceDiagnostics | undefined;
  private lastFrameSize: { width: number; height: number } | undefined;

  constructor(private readonly options: MediaStreamCameraFrameSourceOptions) {}

  static async listDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  }

  async start(onFrame: (frame: NormalizedFrame) => Promise<void> | void, onError: (error: unknown) => void, onEnded: () => void, onLifecycle?: (event: CameraLifecycleEvent) => void): Promise<void> {
    await this.stop();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("Camera capture is not supported by this browser.");
    this.onFrame = onFrame; this.onError = onError; this.onEnded = onEnded; this.onLifecycle = onLifecycle ?? null;
    this.stopped = false; this.paused = false;
    try {
      const negotiated = await negotiateCameraStream(this.constraintPolicy());
      this.stream = negotiated.stream;
      this.diagnostics = negotiated.diagnostics;
      if (this.stopped) { for (const track of this.stream.getTracks()) track.stop(); return; }
      this.options.video.srcObject = this.stream;
      await this.options.video.play();
      this.canvas = document.createElement("canvas");
      const track = this.currentTrack();
      this.endedHandler = () => {
        const retained = { onFrame: this.onFrame, onError: this.onError, onEnded: this.onEnded, onLifecycle: this.onLifecycle };
        void this.stop();
        // Track-ended cleanup is immediate, while ScannerSession may use the
        // retained callbacks for a bounded restart on the next microtask.
        this.onFrame = retained.onFrame; this.onError = retained.onError; this.onEnded = retained.onEnded; this.onLifecycle = retained.onLifecycle;
        retained.onEnded?.();
      };
      track?.addEventListener?.("ended", this.endedHandler);
      if (typeof document !== "undefined") {
        this.visibilityHandler = () => {
          this.onLifecycle?.({
            reason: document.visibilityState === "hidden" ? "background-suspended" : "foreground-resumed",
            timestamp: Date.now(),
            detail: `visibilityState=${document.visibilityState}`,
          });
        };
        document.addEventListener("visibilitychange", this.visibilityHandler);
      }
      if (typeof window !== "undefined") {
        this.orientationHandler = () => this.onLifecycle?.({ reason: "orientation-change", timestamp: Date.now() });
        window.addEventListener("orientationchange", this.orientationHandler);
      }
      this.onLifecycle?.({ reason: "constraints-renegotiated", timestamp: Date.now(), detail: `attempts=${this.diagnostics.attempts.length}` });
      this.schedule();
    } catch (error) { await this.stop(); throw error; }
  }

  pause(): void { this.paused = true; }
  resume(): void { if (this.stopped) return; this.paused = false; this.schedule(); }

  async restart(): Promise<void> {
    const onFrame = this.onFrame; const onError = this.onError; const onEnded = this.onEnded; const onLifecycle = this.onLifecycle;
    if (!onFrame || !onError || !onEnded) throw new Error("Camera source has no active callbacks to restart.");
    await this.start(onFrame, onError, onEnded, onLifecycle ?? undefined);
  }

  async stop(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const video = this.options.video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void };
    if (this.callbackId !== null) video.cancelVideoFrameCallback?.(this.callbackId);
    this.callbackId = null;
    this.stopped = true;
    const track = this.currentTrack();
    if (track && this.endedHandler) track.removeEventListener?.("ended", this.endedHandler);
    this.endedHandler = null;
    for (const streamTrack of this.stream?.getTracks() ?? []) streamTrack.stop();
    this.stream = null;
    this.options.video.srcObject = null;
    if (this.visibilityHandler && typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.visibilityHandler = null;
    if (this.orientationHandler && typeof window !== "undefined") window.removeEventListener("orientationchange", this.orientationHandler);
    this.orientationHandler = null;
    if (this.canvas) { this.canvas.width = 0; this.canvas.height = 0; }
    this.canvas = null;
    this.onFrame = null; this.onError = null; this.onEnded = null; this.onLifecycle = null;
    this.lastFrameSize = undefined;
  }

  currentTrack(): MediaStreamTrack | undefined { return this.stream?.getVideoTracks()[0]; }

  getDeviceDiagnostics(): DeviceDiagnostics {
    return this.diagnostics ?? diagnosticsForTrack(this.constraintPolicy(), this.currentTrack());
  }

  private constraintPolicy(): CameraConstraintPolicy {
    return {
      ...(this.options.deviceId ? { deviceId: this.options.deviceId } : {}),
      facingMode: this.options.facingMode ?? "environment",
      ...(this.options.preferredWidth ? { preferredWidth: this.options.preferredWidth } : {}),
      ...(this.options.preferredHeight ? { preferredHeight: this.options.preferredHeight } : {}),
      ...(this.options.preferredFrameRate ? { preferredFrameRate: this.options.preferredFrameRate } : {}),
      exactDevice: this.options.exactDevice ?? true,
      maximumAttempts: this.options.maximumConstraintAttempts ?? 3,
    };
  }

  private schedule(): void {
    if (this.stopped || this.paused || this.callbackId !== null || this.timer) return;
    const video = this.options.video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };
    if (video.requestVideoFrameCallback) {
      this.callbackId = video.requestVideoFrameCallback(() => { this.callbackId = null; this.capture(); this.schedule(); });
    } else this.timer = setTimeout(() => { this.timer = null; this.capture(); this.schedule(); }, Math.max(16, this.options.fallbackCadenceMs ?? 33));
  }

  private capture(): void {
    if (this.stopped || this.paused) return;
    const video = this.options.video; const canvas = this.canvas;
    if (!canvas || video.videoWidth < 1 || video.videoHeight < 1) return;
    try {
      if (this.lastFrameSize && (this.lastFrameSize.width !== video.videoWidth || this.lastFrameSize.height !== video.videoHeight)) {
        this.onLifecycle?.({ reason: "resolution-change", timestamp: Date.now(), detail: `${this.lastFrameSize.width}x${this.lastFrameSize.height}->${video.videoWidth}x${video.videoHeight}` });
      }
      this.lastFrameSize = { width: video.videoWidth, height: video.videoHeight };
      const maxSide = Math.max(320, Math.min(2_048, this.options.sampleMaxSide ?? 960));
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D frame adapter is unavailable.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const settings = this.currentTrack()?.getSettings();
      const now = Date.now();
      const frame = createRgbaFrame(image.data, image.width, image.height, {
        id: `camera-frame-${++this.sequence}-${now}`, timestampMs: now, sourceType: "camera", ownership: "owned", orientation: 0,
        device: { deviceId: settings?.deviceId, facingMode: settings?.facingMode as "user" | "environment" | "left" | "right" | undefined },
      });
      void this.onFrame?.(frame);
    } catch (error) { this.onError?.(error); }
  }
}
