import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkException } from "@scanly/core";
import {
  CameraRecoveryController,
  ScannerSession,
  cameraError,
  negotiateCameraStream,
  type CameraFrameSource,
  type CameraLifecycleEvent,
  type ScannerFrameDecoder,
} from "@scanly/browser";

const originalNavigator = globalThis.navigator;
afterEach(() => { Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator }); });

function fakeStream(settings: Record<string, unknown> = {}) {
  const track = {
    readyState: "live",
    getSettings: () => settings,
    getCapabilities: () => ({ width: { min: 320, max: 1920 }, torch: false }),
    getConstraints: () => ({ width: { ideal: 1920 } }),
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  return { stream: { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream, track };
}

describe("camera error taxonomy", () => {
  it.each([
    ["NotAllowedError", "camera_permission_denied"],
    ["NotFoundError", "camera_not_found"],
    ["NotReadableError", "camera_busy"],
    ["OverconstrainedError", "camera_constraint_failed"],
  ])("maps %s to %s", (name, code) => expect(cameraError({ name, message: name }).code).toBe(code));
});

it("negotiates preferred constraints then falls back after an overconstrained attempt", async () => {
  const { stream } = fakeStream({ width: 1280, height: 720, frameRate: 30, facingMode: "environment" });
  const getUserMedia = vi.fn()
    .mockRejectedValueOnce(Object.assign(new Error("width constraint failed"), { name: "OverconstrainedError" }))
    .mockResolvedValueOnce(stream);
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getSupportedConstraints: () => ({ width: true, height: true, frameRate: true, facingMode: true }), getUserMedia } } });
  const result = await negotiateCameraStream({ facingMode: "environment", preferredWidth: 1920, preferredHeight: 1080, preferredFrameRate: 30 });
  expect(getUserMedia).toHaveBeenCalledTimes(2);
  expect(result.diagnostics.attempts.map((attempt) => attempt.result)).toEqual(["failed", "negotiated"]);
  expect(result.diagnostics.negotiatedSettings).toMatchObject({ width: 1280, height: 720 });
});

it("does not weaken an explicit exact device after a non-constraint camera failure", async () => {
  const getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error("busy"), { name: "NotReadableError" }));
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getSupportedConstraints: () => ({ deviceId: true }), getUserMedia } } });
  await expect(negotiateCameraStream({ deviceId: "rear", exactDevice: true })).rejects.toMatchObject({ code: "camera_busy" });
  expect(getUserMedia).toHaveBeenCalledOnce();
});

it("bounds camera recovery attempts and exponential delay", async () => {
  const waits: number[] = [];
  const controller = new CameraRecoveryController({ maximumRetries: 2, baseDelayMs: 10, maximumDelayMs: 15, wait: async (delay) => { waits.push(delay); } });
  const first = controller.next("track-ended"); const second = controller.next("track-ended"); const exhausted = controller.next("track-ended");
  await controller.wait(first); await controller.wait(second); await controller.wait(exhausted);
  expect([first, second, exhausted]).toEqual([
    { retry: true, attempt: 1, delayMs: 10, reason: "track-ended" },
    { retry: true, attempt: 2, delayMs: 15, reason: "track-ended" },
    { retry: false, attempt: 2, delayMs: 0, reason: "track-ended" },
  ]);
  expect(waits).toEqual([10, 15]); expect(controller.getStatistics().exhausted).toBe(true);
});

class PlatformSource implements CameraFrameSource {
  starts = 0; stops = 0; restarts = 0; pauses = 0; resumes = 0;
  private onEnded?: () => void; private onLifecycle?: (event: CameraLifecycleEvent) => void;
  async start(_frame: Parameters<CameraFrameSource["start"]>[0], _error: Parameters<CameraFrameSource["start"]>[1], ended: () => void, lifecycle?: (event: CameraLifecycleEvent) => void): Promise<void> { this.starts += 1; this.onEnded = ended; this.onLifecycle = lifecycle; }
  stop(): void { this.stops += 1; }
  async restart(): Promise<void> { this.restarts += 1; }
  pause(): void { this.pauses += 1; }
  resume(): void { this.resumes += 1; }
  currentTrack(): MediaStreamTrack | undefined { return { readyState: "live" } as MediaStreamTrack; }
  end(): void { this.onEnded?.(); }
  lifecycle(reason: CameraLifecycleEvent["reason"]): void { this.onLifecycle?.({ reason, timestamp: Date.now() }); }
}

const decoder: ScannerFrameDecoder = { async decode() { throw new Error("not used"); }, cancel: vi.fn(), dispose: vi.fn() };

it("recovers a track-ended camera within budget without duplicating the ScannerSession", async () => {
  const source = new PlatformSource(); const states: string[] = [];
  const session = new ScannerSession({ source, decoder, cameraRecovery: { maximumRetries: 1, baseDelayMs: 0 } }); session.onStateChange((state) => states.push(state));
  await session.start(); source.end(); await new Promise((resolve) => setTimeout(resolve, 0));
  expect(source.restarts).toBe(1); expect(session.getState()).toBe("scanning");
  expect(session.getStatistics()).toMatchObject({ cameraTrackEndings: 1, cameraRecovery: { attempts: 1, restarts: 1, failures: 0, exhausted: false }, staleEvents: 0 });
  expect(states.filter((state) => state === "starting")).toHaveLength(1);
  await session.dispose();
});

it("invalidates generations across orientation, resolution, and background/foreground lifecycle", async () => {
  const source = new PlatformSource(); const session = new ScannerSession({ source, decoder });
  await session.start(); source.lifecycle("orientation-change"); source.lifecycle("resolution-change"); source.lifecycle("background-suspended"); expect(session.getState()).toBe("paused"); source.lifecycle("foreground-resumed");
  expect(session.getState()).toBe("scanning"); expect(source.pauses).toBe(1); expect(source.resumes).toBe(1);
  expect(session.getStatistics()).toMatchObject({ cameraGenerationInvalidations: 4, staleEvents: 0 }); await session.dispose();
});

it("surfaces denied camera startup as a typed SdkException", async () => {
  const source: CameraFrameSource = { async start() { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); }, stop() {} };
  const session = new ScannerSession({ source, decoder });
  await expect(session.start()).rejects.toSatisfy((error: unknown) => error instanceof SdkException && error.error.code === "camera_permission_denied");
  expect(session.getState()).toBe("failed"); await session.dispose();
});
