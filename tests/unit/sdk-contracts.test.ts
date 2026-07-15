import { describe, expect, it } from "vitest";
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
});
