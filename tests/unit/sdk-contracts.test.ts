import { describe, expect, it, vi } from "vitest";
import {
  BoundedFrameArtifactStore,
  CaptureRouter,
  CaptureSession,
  SdkException,
  createRgbaFrame,
  executeTaskGraph,
  validateFrame,
  type OperatorContext,
  type ScanOutcome,
} from "@scanly/core";

function success(frameId: string): ScanOutcome {
  const result = { format: "qr_code" as const, rawText: "ok", engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [result], primary: result, frameId, scenarioId: "balanced", attemptCount: 1, timing: { totalMs: 1 } };
}

class DelayedRouter extends CaptureRouter {
  readonly resolvers: Array<() => void> = [];
  override async scan(frame: Parameters<CaptureRouter["scan"]>[0]): Promise<ScanOutcome> {
    await new Promise<void>((resolve) => this.resolvers.push(resolve));
    return success(frame.id);
  }
}

class CountingRouter extends CaptureRouter {
  calls = 0;
  override async scan(frame: Parameters<CaptureRouter["scan"]>[0]): Promise<ScanOutcome> {
    this.calls += 1;
    return success(frame.id);
  }
}

describe("frame and artifact contracts", () => {
  it("validates dimensions, stride, and buffer length without reading out of bounds", () => {
    const frame = createRgbaFrame(new Uint8ClampedArray(15), 2, 2);
    expect(validateFrame(frame).map((issue) => issue.path)).toContain("data");
    expect(validateFrame(null)).toEqual([{ path: "$", message: "Frame must be an object." }]);
    expect(validateFrame({ id: "unsafe" }).map((issue) => issue.path)).toEqual(expect.arrayContaining(["timestampMs", "width", "height", "pixelFormat", "data"]));
  });

  it("enforces bounded per-frame retained artifacts and releases them", () => {
    const store = new BoundedFrameArtifactStore(1, 8);
    store.set("gray", new Uint8Array(8), 8);
    expect(() => store.set("second", new Uint8Array(1), 1)).toThrow(/budget exceeded/);
    store.dispose();
    expect(store.allocationCount).toBe(0);
    expect(store.retainedBytes).toBe(0);
  });

  it("executes dependency-ready graph branches and rejects cycles", async () => {
    const order: string[] = [];
    const artifacts = new BoundedFrameArtifactStore(4, 100);
    const context: OperatorContext = { artifacts, trace: (stage) => order.push(stage) };
    await executeTaskGraph([
      { id: "source", dependencies: [], run: async (ctx) => ctx.trace("source") },
      { id: "a", dependencies: ["source"], run: async (ctx) => ctx.trace("a") },
      { id: "b", dependencies: ["source"], run: async (ctx) => ctx.trace("b") },
      { id: "aggregate", dependencies: ["a", "b"], run: async (ctx) => ctx.trace("aggregate") },
    ], context, "parallel");
    expect(order[0]).toBe("source");
    expect(order.at(-1)).toBe("aggregate");
    await expect(executeTaskGraph([{ id: "cycle", dependencies: ["cycle"], run: async () => undefined }], context)).rejects.toThrow(/cycle/);
  });
});

describe("capture session lifecycle", () => {
  it("has deterministic start, stop, repeated cancel, and idempotent disposal", () => {
    const session = new CaptureSession();
    session.initialize();
    session.start("upload");
    session.switchSource("camera");
    session.switchSource("upload");
    expect(session.getSource()).toBe("upload");
    session.cancel();
    session.cancel();
    session.stop();
    expect(session.getState()).toBe("stopped");
    session.dispose();
    session.dispose();
    expect(session.getState()).toBe("disposed");
    expect(() => session.start()).toThrow(SdkException);
  });

  it("prevents a superseded result from crossing the ownership boundary", async () => {
    const router = new DelayedRouter();
    const session = new CaptureSession({ router });
    session.start("upload");
    const first = session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "first" }));
    await Promise.resolve();
    const second = session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "second" }));
    await Promise.resolve();
    router.resolvers[0]();
    router.resolvers[1]();
    const [oldOutcome, newOutcome] = await Promise.all([first, second]);
    expect(oldOutcome.ok).toBe(false);
    if (!oldOutcome.ok) expect(oldOutcome.error.code).toBe("cancelled");
    expect(newOutcome.ok).toBe(true);
  });

  it("rejects concurrent scans when configured rather than silently replacing", async () => {
    const router = new DelayedRouter();
    const session = new CaptureSession({ router, concurrentCallPolicy: "reject" });
    session.start();
    const first = session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "first" }));
    await Promise.resolve();
    const rejected = await session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "second" }));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("concurrent_call_rejected");
    router.resolvers[0]();
    await first;
  });

  it("fails closed before Router work for a pre-aborted signal and releases an owned frame exactly once", async () => {
    const router = new CountingRouter();
    const session = new CaptureSession({ router });
    const controller = new AbortController();
    const dispose = vi.fn();
    const addAbortListener = vi.spyOn(controller.signal, "addEventListener");
    const removeAbortListener = vi.spyOn(controller.signal, "removeEventListener");
    session.start("upload");
    controller.abort();

    const outcome = await session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { ownership: "owned", dispose }), { signal: controller.signal });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
    expect(router.calls).toBe(0);
    expect(dispose).toHaveBeenCalledOnce();
    expect(addAbortListener).toHaveBeenCalledOnce();
    expect(removeAbortListener).toHaveBeenCalledOnce();
  });

  it("preserves a borrowed frame when its pre-aborted scan is cancelled", async () => {
    const router = new CountingRouter();
    const session = new CaptureSession({ router });
    const controller = new AbortController();
    const dispose = vi.fn();
    session.start("upload");
    controller.abort();

    const outcome = await session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { ownership: "borrowed", dispose }), { signal: controller.signal });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
    expect(router.calls).toBe(0);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("fails closed when an external signal aborts while its listener is being registered", async () => {
    const router = new CountingRouter();
    const session = new CaptureSession({ router });
    const controller = new AbortController();
    const addEventListener = controller.signal.addEventListener.bind(controller.signal);
    vi.spyOn(controller.signal, "addEventListener").mockImplementation(((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      addEventListener(type, listener, options);
      controller.abort();
    }) as AbortSignal["addEventListener"]);
    session.start("upload");

    const outcome = await session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { ownership: "borrowed" }), { signal: controller.signal });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
    expect(router.calls).toBe(0);
  });

  it("keeps cancellation authoritative when the signal aborts after Router work starts", async () => {
    const router = new DelayedRouter();
    const session = new CaptureSession({ router });
    const controller = new AbortController();
    session.start("upload");

    const pending = session.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { ownership: "borrowed" }), { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    router.resolvers[0]();
    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
  });
});
