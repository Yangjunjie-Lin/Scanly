import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureRouter, sdkError, type NormalizedFrame, type ScanOutcome } from "@scanly/core";
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
  handler: (frame: NormalizedFrame, options?: Parameters<CaptureRouter["scan"]>[1]) => Promise<ScanOutcome> = async (frame) => success(frame.id);
  override scan(frame: NormalizedFrame, options: Parameters<CaptureRouter["scan"]>[1] = {}): Promise<ScanOutcome> { return this.handler(frame, options); }
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
    expect(loadPixelBufferFromFile).toHaveBeenCalledOnce();
    expect(stages).toContain("Worker unavailable; retrying on main thread within the remaining scan budget...");
    expect(routerSpy).toHaveBeenCalledOnce();
    await session.dispose();
  });

  it("falls back with the same format mask and only the remaining time and attempt budgets", async () => {
    vi.stubGlobal("Worker", class {});
    const router = new TestRouter();
    const scenario = getBuiltinScenario("balanced");
    scenario.acceptedFormats = ["data_matrix"];
    scenario.budgets.maxExecutionMs = 1_000;
    scenario.budgets.maxAttempts = 10;
    scenario.multiCode.maxResults = 8;
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null,
      postMessage: vi.fn(function (this: { onmessage: ((event: MessageEvent) => void) | null }, message: { type: string; jobId?: string; generation?: number }) {
        if (message.type !== "scan") return;
        queueMicrotask(() => this.onmessage?.({ data: {
          type: "result", jobId: message.jobId, generation: message.generation,
          outcome: { ok: false, error: sdkError("engine_execution_failure", "Worker decoder failed"), frameId: "worker", scenarioId: "balanced", attemptCount: 3, timing: { totalMs: 250, workerSetupMs: 2, workerTransferMs: 3 } },
        } } as MessageEvent));
      }),
      terminate: vi.fn(),
    };
    const session = new BrowserCaptureSession({ router, workerFactory: () => worker, scenario });
    const routerSpy = vi.spyOn(router, "scan");
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    const outcome = await session.scanFile(file);
    expect(outcome.ok).toBe(true);
    expect(outcome.attemptCount).toBe(4);
    expect(outcome.timing.totalMs).toBeGreaterThanOrEqual(251);
    expect(outcome.timing.workerSetupMs).toBeTypeOf("number");
    expect(outcome.timing.workerTransferMs).toBeTypeOf("number");
    expect(loadPixelBufferFromFile).toHaveBeenCalledOnce();
    expect(routerSpy).toHaveBeenCalledOnce();
    const fallbackScenario = routerSpy.mock.calls[0][1]?.scenario;
    expect(fallbackScenario?.acceptedFormats).toEqual(["data_matrix"]);
    expect(fallbackScenario?.budgets.maxAttempts).toBe(7);
    expect(fallbackScenario?.budgets.maxExecutionMs).toBe(750);
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

  it("does not load pixels, create a Worker, or route a pre-aborted file scan", async () => {
    vi.stubGlobal("Worker", class {});
    const router = new TestRouter();
    const routerSpy = vi.spyOn(router, "scan");
    const worker = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null,
      postMessage: vi.fn(function (this: { onmessage: ((event: MessageEvent) => void) | null }, message: { type: string; jobId?: string; generation?: number; frame?: { id: string } }) {
        if (message.type !== "scan") return;
        queueMicrotask(() => this.onmessage?.({ data: { type: "result", jobId: message.jobId, generation: message.generation, outcome: success(message.frame!.id) } } as MessageEvent));
      }),
      terminate: vi.fn(),
    };
    const workerFactory = vi.fn(() => worker);
    const session = new BrowserCaptureSession({ router, workerFactory });
    const controller = new AbortController();
    const addAbortListener = vi.spyOn(controller.signal, "addEventListener");
    const removeAbortListener = vi.spyOn(controller.signal, "removeEventListener");
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    controller.abort();

    const outcome = await session.scanFile(file, { signal: controller.signal });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
    expect(loadPixelBufferFromFile).not.toHaveBeenCalled();
    expect(routerSpy).not.toHaveBeenCalled();
    expect(workerFactory).not.toHaveBeenCalled();
    expect(addAbortListener).toHaveBeenCalledOnce();
    expect(removeAbortListener).toHaveBeenCalledOnce();
    await session.dispose();
  });

  it("keeps cancellation authoritative when a file scan aborts after loading starts", async () => {
    const router = new TestRouter();
    const routerSpy = vi.spyOn(router, "scan");
    const session = new BrowserCaptureSession({ router });
    const controller = new AbortController();
    let release!: (value: typeof pixels) => void;
    loadPixelBufferFromFile.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    session.start();

    const pending = session.scanFile(file, { forceMainThread: true, signal: controller.signal });
    await vi.waitFor(() => expect(loadPixelBufferFromFile).toHaveBeenCalledOnce());
    controller.abort();
    release(pixels);
    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
    expect(routerSpy).not.toHaveBeenCalled();
    await session.dispose();
  });
});
