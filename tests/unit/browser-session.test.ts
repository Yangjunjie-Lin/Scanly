import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureRouter, type NormalizedFrame, type ScanOutcome } from "@scanly/core";
import { createPixelBuffer } from "@scanly/core/qr";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const { loadPixelBufferFromFile } = vi.hoisted(() => ({ loadPixelBufferFromFile: vi.fn() }));
vi.mock("../../packages/browser/src/image-loader", () => ({ loadPixelBufferFromFile }));
import { BrowserCaptureSession } from "../../packages/browser/src/browser-session";

const file = {} as File;
const pixels = createPixelBuffer(new Uint8ClampedArray(16), 2, 2);
function success(frameId: string): ScanOutcome {
  const result = { format: "qr_code" as const, rawText: "HELLO", engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [result], primary: result, frameId, scenarioId: "balanced", attemptCount: 1, timing: { totalMs: 1 } };
}

class TestRouter extends CaptureRouter {
  handler: (frame: NormalizedFrame) => Promise<ScanOutcome> = async (frame) => success(frame.id);
  override scan(frame: NormalizedFrame): Promise<ScanOutcome> { return this.handler(frame); }
  override updateScenario(): void {}
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("BrowserCaptureSession", () => {
  it("rejects malformed constructor configuration", () => {
    const scenario = { ...getBuiltinScenario("balanced"), output: undefined };
    expect(() => new BrowserCaptureSession({ scenario: scenario as never })).toThrow(/output/);
  });

  it("routes main-thread uploads as normalized frames through CaptureRouter", async () => {
    const router = new TestRouter();
    const session = new BrowserCaptureSession({ router });
    expect((await session.scanFile(file, { forceMainThread: true })).ok).toBe(false);
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    const spy = vi.spyOn(router, "scan");
    const outcome = await session.scanFile(file, { forceMainThread: true });
    expect(outcome.ok).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ pixelFormat: "rgba8888", sourceType: "upload", ownership: "owned" }), expect.any(Object));
    await session.dispose();
  });

  it("returns typed file failures without invoking Router", async () => {
    const router = new TestRouter();
    const session = new BrowserCaptureSession({ router });
    session.start();
    loadPixelBufferFromFile.mockRejectedValue(Object.assign(new Error("too large"), { code: "image_too_large" }));
    const outcome = await session.scanFile(file, { forceMainThread: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("resource_limit_exceeded");
  });

  it("falls back to the main-thread Router after Worker bootstrap failure", async () => {
    vi.stubGlobal("Worker", class {});
    const router = new TestRouter();
    const worker = {
      onmessage: null,
      onerror: null,
      postMessage: vi.fn(function (this: { onerror: ((event: ErrorEvent) => void) | null }) {
        queueMicrotask(() => this.onerror?.({ message: "chunk failed to load" } as ErrorEvent));
      }),
      terminate: vi.fn(),
    };
    const session = new BrowserCaptureSession({ router, workerFactory: () => worker });
    const routerSpy = vi.spyOn(router, "scan");
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    const stages: string[] = [];
    const outcome = await session.scanFile(file, { onStage: (stage) => stages.push(stage) });
    expect(outcome.ok).toBe(true);
    expect(loadPixelBufferFromFile).toHaveBeenCalledTimes(2);
    expect(stages).toContain("Worker unavailable; retrying on main thread...");
    expect(routerSpy).toHaveBeenCalledOnce();
    await session.dispose();
  });

  it("rejects concurrent work and prevents superseded results", async () => {
    const router = new TestRouter();
    let release!: () => void;
    router.handler = async (frame) => { await new Promise<void>((resolve) => { release = resolve; }); return success(frame.id); };
    const session = new BrowserCaptureSession({ router, concurrentCallPolicy: "reject" });
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    const first = session.scanFile(file, { forceMainThread: true });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const rejected = await session.scanFile(file, { forceMainThread: true });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("concurrent_call_rejected");
    release();
    await first;
  });
});
