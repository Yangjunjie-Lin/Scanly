import { describe, expect, it, vi } from "vitest";
import { CaptureRouter, EngineRegistry, createRgbaFrame, type DecoderEngine } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";

function configured(engine: DecoderEngine): CaptureRouter {
  const engines = new EngineRegistry(); engines.register(engine);
  const scenario = getBuiltinScenario("fast"); scenario.decoders.order = [engine.id];
  return new CaptureRouter({ scenario, engines });
}

function engine(decode: DecoderEngine["decode"]): DecoderEngine {
  return { id: "fake", version: "1", capabilities: { formats: ["qr_code"], supportsMultiple: false, returnsRawBytes: false, returnsCornerPoints: false, threadSafe: true }, decode };
}

describe("frame lease ownership", () => {
  it("releases owned frames rejected before decoding exactly once", async () => {
    const dispose = vi.fn();
    const router = configured(engine(async () => ({ ok: false, category: "not-found", message: "none", elapsedMs: 0 })));
    const frame = createRgbaFrame(new Uint8ClampedArray(3), 1, 1, { ownership: "owned", dispose });
    const outcome = await router.scan(frame);
    expect(outcome.ok).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("releases transferred concurrency rejection and active frame once each", async () => {
    let release!: () => void;
    const router = configured(engine(async () => { await new Promise<void>((resolve) => { release = resolve; }); return { ok: true, results: [{ text: "done", format: "qr_code", elapsedMs: 1 }] }; }));
    const firstDispose = vi.fn(); const secondDispose = vi.fn();
    const first = router.scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4), 64, 64, { id: "first", ownership: "transferred", dispose: firstDispose }));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const second = await router.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "second", ownership: "transferred", dispose: secondDispose }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("concurrent_call_rejected");
    expect(secondDispose).toHaveBeenCalledOnce();
    release(); await first;
    expect(firstDispose).toHaveBeenCalledOnce();
  });

  it("releases after cancellation and engine failure without touching borrowed frames", async () => {
    const throwing = configured(engine(async () => { throw new Error("engine crash"); }));
    const ownedDispose = vi.fn();
    const failed = await throwing.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { ownership: "owned", dispose: ownedDispose }));
    expect(failed.ok).toBe(false);
    expect(ownedDispose).toHaveBeenCalledOnce();

    const borrowedDispose = vi.fn();
    await throwing.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { ownership: "borrowed", dispose: borrowedDispose }));
    expect(borrowedDispose).not.toHaveBeenCalled();
  });

  it("releases malformed per-call scenarios", async () => {
    const dispose = vi.fn();
    const router = configured(engine(async () => ({ ok: false, category: "not-found", message: "none", elapsedMs: 0 })));
    const invalid = { ...getBuiltinScenario("fast"), output: undefined };
    await router.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { ownership: "owned", dispose }), { scenario: invalid as never });
    expect(dispose).toHaveBeenCalledOnce();
  });
});
