import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureRouter, type NormalizedFrame, type ScanOutcome } from "@scanly/core";
import { BrowserCameraSource } from "../../packages/browser/src/camera-source";
import type { DecodeWorkerLike } from "../../packages/browser/src/worker/worker-client";
import type { WorkerRequest, WorkerResponse } from "../../packages/browser/src/worker/worker-messages";

function success(frameId: string): ScanOutcome {
  const result = { format: "qr_code" as const, rawText: "CAMERA", engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [result], primary: result, frameId, scenarioId: "balanced", attemptCount: 1, timing: { totalMs: 1 } };
}

class TestRouter extends CaptureRouter {
  readonly frames: NormalizedFrame[] = [];
  override async scan(frame: NormalizedFrame): Promise<ScanOutcome> { this.frames.push(frame); return success(frame.id); }
  override updateScenario(): void {}
}

class FakeTrack {
  stop = vi.fn();
  applyConstraints = vi.fn().mockResolvedValue(undefined);
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  getCapabilities() { return { torch: true, zoom: { min: 1, max: 4 } }; }
  getSettings() { return { zoom: 2, deviceId: "rear", facingMode: "environment" }; }
}
class FakeMediaStream {
  constructor(readonly track = new FakeTrack()) {}
  getTracks() { return [this.track]; }
  getVideoTracks() { return [this.track]; }
}

const listeners = new Map<string, Set<() => void>>();
const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(16), width: 2, height: 2 })) };

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.stubGlobal("screen", { orientation: { angle: 0 } });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    addEventListener: (name: string, handler: () => void) => { const set = listeners.get(name) ?? new Set(); set.add(handler); listeners.set(name, set); },
    removeEventListener: (name: string, handler: () => void) => listeners.get(name)?.delete(handler),
  });
  vi.stubGlobal("window", {
    addEventListener: (name: string, handler: () => void) => { const set = listeners.get(name) ?? new Set(); set.add(handler); listeners.set(name, set); },
    removeEventListener: (name: string, handler: () => void) => listeners.get(name)?.delete(handler),
  });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function installMedia(stream = new FakeMediaStream()) {
  const getUserMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia, enumerateDevices: vi.fn().mockResolvedValue([{ kind: "videoinput", deviceId: "rear" }, { kind: "audioinput", deviceId: "mic" }]) } });
  return { stream, getUserMedia };
}

function video() { return { srcObject: null, videoWidth: 2, videoHeight: 2, play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement; }

describe("Router camera source", () => {
  it("samples normalized frames, auto-stops, and removes every listener/track", async () => {
    const { stream } = installMedia();
    const router = new TestRouter();
    const source = new BrowserCameraSource({ router });
    const element = video();
    const results = vi.fn();
    await source.start(element, { onResult: results, stopAfterResult: true, frameCadenceMs: 50 });
    await vi.advanceTimersByTimeAsync(1);
    expect(router.frames[0]).toMatchObject({ sourceType: "camera", pixelFormat: "rgba8888", ownership: "owned" });
    expect(results).toHaveBeenCalledOnce();
    expect(stream.track.stop).toHaveBeenCalledOnce();
    expect(element.srcObject).toBeNull();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    source.stop();
    expect(results).toHaveBeenCalledOnce();
  });

  it("routes sampled camera frames through one persistent Worker when available", async () => {
    installMedia();
    vi.stubGlobal("Worker", class {});
    class AutoWorker implements DecodeWorkerLike {
      onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      posted: WorkerRequest[] = [];
      terminate = vi.fn();
      postMessage(message: WorkerRequest): void {
        this.posted.push(message);
        if (message.type === "scan") queueMicrotask(() => this.onmessage?.({ data: { type: "result", jobId: message.jobId, outcome: success(message.frame.id) } } as MessageEvent<WorkerResponse>));
      }
    }
    const worker = new AutoWorker();
    const router = new TestRouter();
    const onResult = vi.fn();
    const source = new BrowserCameraSource({ router, workerFactory: () => worker });
    await source.start(video(), { onResult, stopAfterResult: true, frameCadenceMs: 50 });
    await vi.advanceTimersByTimeAsync(1);
    expect(worker.posted.filter((message) => message.type === "scan")).toHaveLength(1);
    expect(router.frames).toHaveLength(0);
    expect(onResult).toHaveBeenCalledOnce();
  });

  it("page-hide cleanup is authoritative and idempotent", async () => {
    const { stream } = installMedia();
    const source = new BrowserCameraSource({ router: new TestRouter() });
    await source.start(video(), { onResult: vi.fn(), stopAfterResult: false });
    Object.assign(document, { visibilityState: "hidden" });
    for (const handler of [...(listeners.get("visibilitychange") ?? [])]) handler();
    source.stop();
    expect(stream.track.stop).toHaveBeenCalledOnce();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it("reports and applies torch/zoom capabilities", async () => {
    const { stream } = installMedia();
    const source = new BrowserCameraSource({ router: new TestRouter() });
    await source.start(video(), { onResult: vi.fn(), stopAfterResult: false });
    expect(source.getCapabilities()).toEqual({ torch: true, minZoom: 1, maxZoom: 4, currentZoom: 2 });
    await source.setTorch(true);
    await source.setZoom(3);
    expect(stream.track.applyConstraints).toHaveBeenCalledTimes(2);
    await expect(source.setZoom(5)).rejects.toThrow(/between/);
    source.stop();
  });

  it("maps permission failures and leaves no partial source", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError: Permission denied")), enumerateDevices: vi.fn() } });
    const onError = vi.fn();
    const source = new BrowserCameraSource({ router: new TestRouter() });
    await expect(source.start(video(), { onResult: vi.fn(), onError })).rejects.toThrow(/NotAllowedError/);
    expect(onError.mock.calls[0][0].error.code).toBe("camera_permission_denied");
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});
