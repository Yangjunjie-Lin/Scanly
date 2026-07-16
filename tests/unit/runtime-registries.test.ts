import { describe, expect, it, vi } from "vitest";
import {
  CaptureRouter,
  EngineRegistry,
  OperatorRegistry,
  ScenarioCompiler,
  SdkException,
  ValidatorRegistry,
  createDefaultOperatorRegistry,
  createRgbaFrame,
  type DecoderEngine,
  type EngineDecodeOptions,
  type EngineOutcome,
  type NormalizedFrame,
} from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";

class FakeEngine implements DecoderEngine {
  readonly version = "1.0.0";
  readonly capabilities;
  readonly initialize = vi.fn(async () => undefined);
  readonly dispose = vi.fn(async () => undefined);
  readonly decodeSpy = vi.fn(async (_frame: NormalizedFrame, _options: EngineDecodeOptions): Promise<EngineOutcome> => ({ ok: true, results: [{ text: "PLUGIN_RESULT", format: "qr_code", elapsedMs: 1 }] }));
  constructor(readonly id = "fake", threadSafe = true) {
    this.capabilities = { formats: ["qr_code" as const], supportsMultiple: false, returnsRawBytes: false, returnsCornerPoints: false, threadSafe };
  }
  decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome> { return this.decodeSpy(frame, options); }
}

function scenario(engineId = "fake") {
  const value = getBuiltinScenario("fast");
  value.decoders.order = [engineId];
  value.output.includeAttempts = true;
  return value;
}

describe("EngineRegistry", () => {
  it("registers, resolves capabilities, rejects duplicates, and replaces explicitly", () => {
    const registry = new EngineRegistry();
    const first = new FakeEngine();
    registry.register(first);
    expect(registry.resolve(["qr_code"])).toEqual([first]);
    expect(() => registry.register(new FakeEngine())).toThrow(SdkException);
    const replacement = new FakeEngine();
    registry.register(replacement, { replace: true });
    expect(registry.get("fake")).toBe(replacement);
  });

  it("initializes lazily, serializes non-thread-safe execution, and disposes once", async () => {
    const engine = new FakeEngine("confined", false);
    let active = 0;
    let maxActive = 0;
    engine.decodeSpy.mockImplementation(async () => {
      active += 1; maxActive = Math.max(maxActive, active);
      await Promise.resolve(); active -= 1;
      return { ok: false, category: "not-found", message: "none", elapsedMs: 1 };
    });
    const registry = new EngineRegistry();
    registry.register(engine);
    const frame = createRgbaFrame(new Uint8ClampedArray(4), 1, 1);
    await Promise.all([registry.decode("confined", frame, { formats: ["qr_code"], findMultiple: false }), registry.decode("confined", frame, { formats: ["qr_code"], findMultiple: false })]);
    expect(engine.initialize).toHaveBeenCalledOnce();
    expect(maxActive).toBe(1);
    await registry.disposeAll();
    await registry.disposeAll();
    expect(engine.dispose).toHaveBeenCalledOnce();
    await expect(registry.decode("confined", frame, { formats: ["qr_code"], findMultiple: false })).rejects.toThrow(/disposed/);
  });

  it("propagates typed initialization failure", async () => {
    const engine = new FakeEngine();
    engine.initialize.mockRejectedValueOnce(new Error("init failed"));
    const registry = new EngineRegistry();
    registry.register(engine);
    await expect(registry.initializeAll()).rejects.toMatchObject({ error: { code: "engine_initialization_failure" } });
  });

  it("waits for an active thread-safe decode before disposing the engine", async () => {
    const engine = new FakeEngine("active", true);
    let finish!: () => void;
    engine.decodeSpy.mockImplementation(() => new Promise<EngineOutcome>((resolve) => {
      finish = () => resolve({ ok: false, category: "not-found", message: "none", elapsedMs: 1 });
    }));
    const registry = new EngineRegistry(); registry.register(engine);
    const decoding = registry.decode("active", createRgbaFrame(new Uint8ClampedArray(4), 1, 1), { formats: ["qr_code"], findMultiple: false });
    await vi.waitFor(() => expect(engine.decodeSpy).toHaveBeenCalledOnce());
    let disposed = false;
    const disposal = registry.disposeAll().then(() => { disposed = true; });
    await Promise.resolve();
    expect(disposed).toBe(false);
    finish();
    await decoding; await disposal;
    expect(engine.dispose).toHaveBeenCalledOnce();
  });
});

describe("scenario-compiled Router", () => {
  it("executes an arbitrary fake engine through registered operators", async () => {
    const engines = new EngineRegistry();
    const engine = new FakeEngine();
    engines.register(engine);
    const router = new CaptureRouter({ scenario: scenario(), engines });
    const outcome = await router.scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64, { id: "plugin-frame" }));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.primary.rawText).toBe("PLUGIN_RESULT");
      expect(outcome.primary.engine).toEqual({ id: "fake", version: "1.0.0" });
      expect(outcome.attempts?.[0]).toMatchObject({ engineId: "fake", success: true });
    }
    expect(engine.decodeSpy).toHaveBeenCalled();
  });

  it("maps ROI candidate corners to original-frame pixels and omits unknown orientation", async () => {
    const engines = new EngineRegistry();
    const engine = new FakeEngine();
    engine.decodeSpy.mockResolvedValue({ ok: true, results: [{
      text: "GEOMETRY", format: "qr_code", elapsedMs: 1,
      cornerPoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
    }] });
    engines.register(engine);
    const value = scenario();
    value.input.roi = { mode: "relative", x: 0.25, y: 0.2, width: 0.5, height: 0.5 };
    value.localization.strategy = "full-frame";
    const outcome = await new CaptureRouter({ scenario: value, engines }).scan(createRgbaFrame(new Uint8ClampedArray(200 * 200 * 4), 200, 200));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.primary.cornerPoints?.[0]).toEqual({ x: 50, y: 40 });
      expect(outcome.primary.orientation).toBeUndefined();
    }
  });

  it.each([
    ["success-wins", true, undefined],
    ["required-engine-fails", false, "engine_execution_failure"],
    ["any-engine-fails", false, "engine_execution_failure"],
  ] as const)("applies the %s parallel engine failure policy", async (failurePolicy, expectedOk, expectedCode) => {
    const engines = new EngineRegistry();
    const required = new FakeEngine("required");
    required.decodeSpy.mockResolvedValue({ ok: false, category: "execution", message: "required failed", elapsedMs: 1 });
    const fallback = new FakeEngine("fallback");
    fallback.decodeSpy.mockResolvedValue({ ok: true, results: [{ text: "FALLBACK_RESULT", format: "qr_code", elapsedMs: 1 }] });
    engines.register(required); engines.register(fallback);
    const value = scenario("required");
    value.decoders.order = ["required", "fallback"];
    value.decoders.execution = "parallel";
    value.decoders.failurePolicy = failurePolicy;
    if (failurePolicy === "required-engine-fails") value.decoders.requiredEngineIds = ["required"];
    value.output.includeDebugTrace = true;
    const outcome = await new CaptureRouter({ scenario: value, engines }).scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64));
    expect(outcome.ok).toBe(expectedOk);
    if (outcome.ok) {
      expect(outcome.primary.rawText).toBe("FALLBACK_RESULT");
    } else {
      expect(outcome.error.code).toBe(expectedCode);
    }
    expect(outcome.engineDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ engineId: "required", status: "execution-failure" }),
      expect.objectContaining({ engineId: "fallback", status: "success" }),
    ]));
  });

  it("reports cancellation of a losing parallel branch", async () => {
    const engines = new EngineRegistry();
    const winner = new FakeEngine("winner");
    const loser = new FakeEngine("loser");
    loser.decodeSpy.mockImplementation((_frame, options) => new Promise<EngineOutcome>((resolve) => {
      const cancel = () => resolve({ ok: false, category: "cancelled", message: "branch cancelled", elapsedMs: 1 });
      if (options.signal?.aborted) cancel(); else options.signal?.addEventListener("abort", cancel, { once: true });
    }));
    engines.register(winner); engines.register(loser);
    const value = scenario("winner");
    value.decoders.order = ["winner", "loser"];
    value.decoders.execution = "parallel";
    value.output.includeDebugTrace = true;
    const outcome = await new CaptureRouter({ scenario: value, engines }).scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64));
    expect(outcome.ok).toBe(true);
    expect(outcome.engineDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ engineId: "winner", status: "success" }),
      expect.objectContaining({ engineId: "loser", status: "cancelled" }),
    ]));
  });

  it("shares the global attempt cap, gives the primary usable work, bounds the secondary, and preserves priority", async () => {
    const engines = new EngineRegistry();
    const primary = new FakeEngine("primary"); const secondary = new FakeEngine("secondary");
    primary.decodeSpy.mockResolvedValue({ ok: false, category: "not-found", message: "none", elapsedMs: 1 });
    secondary.decodeSpy.mockResolvedValue({ ok: false, category: "not-found", message: "none", elapsedMs: 1 });
    engines.register(primary); engines.register(secondary);
    const value = scenario("primary"); value.decoders.order = ["primary", "secondary"]; value.decoders.execution = "parallel"; value.output.includeDebugTrace = true;
    const outcome = await new CaptureRouter({ scenario: value, engines }).scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64));
    expect(outcome.attemptCount).toBeLessThanOrEqual(value.budgets.maxAttempts);
    expect(outcome.engineDiagnostics?.map((diagnostic) => diagnostic.engineId)).toEqual(["primary", "secondary"]);
    expect(outcome.engineDiagnostics?.[0].attemptCount).toBeGreaterThan(0);
    expect(outcome.engineDiagnostics?.[1].attemptCount).toBeLessThanOrEqual(Math.floor(value.budgets.maxAttempts * 0.3));
  });

  it("keeps all parallel branches active for multi-code completion", async () => {
    const engines = new EngineRegistry();
    const primary = new FakeEngine("primary"); const secondary = new FakeEngine("secondary");
    primary.decodeSpy.mockResolvedValue({ ok: true, results: [{ text: "PRIMARY", format: "qr_code", elapsedMs: 1 }] });
    secondary.decodeSpy.mockResolvedValue({ ok: true, results: [{ text: "SECONDARY", format: "qr_code", elapsedMs: 1 }] });
    engines.register(primary); engines.register(secondary);
    const value = getBuiltinScenario("balanced"); value.decoders.order = ["primary", "secondary"]; value.decoders.execution = "parallel"; value.multiCode.maxResults = 2; value.output.includeDebugTrace = true;
    const outcome = await new CaptureRouter({ scenario: value, engines }).scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4).fill(255), 64, 64));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.results.map((result) => result.rawText)).toEqual(["PRIMARY", "SECONDARY"]);
    expect(outcome.engineDiagnostics?.every((diagnostic) => diagnostic.status !== "cancelled")).toBe(true);
  });

  it.each([
    ["execution", "engine_execution_failure"],
    ["timeout", "timeout"],
    ["invalid-input", "invalid_image"],
  ] as const)("propagates %s engine outcomes", async (category, code) => {
    const engines = new EngineRegistry(); const engine = new FakeEngine();
    engine.decodeSpy.mockResolvedValue({ ok: false, category, message: category, elapsedMs: 1 });
    engines.register(engine);
    const outcome = await new CaptureRouter({ scenario: scenario(), engines }).scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4), 64, 64));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe(code);
  });

  it("aborts and settles active scans before Router engine disposal", async () => {
    const engines = new EngineRegistry(); const engine = new FakeEngine();
    engine.decodeSpy.mockImplementation(async (_frame, options) => new Promise<EngineOutcome>((resolve) => {
      const cancel = () => resolve({ ok: false, category: "cancelled", message: "cancelled", elapsedMs: 1 });
      if (options.signal?.aborted) cancel(); else options.signal?.addEventListener("abort", cancel, { once: true });
    }));
    engines.register(engine);
    const router = new CaptureRouter({ scenario: scenario(), engines });
    const scanning = router.scan(createRgbaFrame(new Uint8ClampedArray(64 * 64 * 4), 64, 64));
    await vi.waitFor(() => expect(engine.decodeSpy).toHaveBeenCalledOnce());
    await router.dispose();
    const outcome = await scanning;
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("cancelled");
    expect(engine.dispose).toHaveBeenCalledOnce();
  });

  it("rejects missing operators, engines, quality, and required validators while allowing registry-serialized parallel engines", () => {
    const engines = new EngineRegistry();
    engines.register(new FakeEngine("unsafe", false));
    engines.register(new FakeEngine("safe", true));
    const validators = new ValidatorRegistry();
    const operators = createDefaultOperatorRegistry();
    operators.unregister("scanly.semantic-parsing");
    const compiler = new ScenarioCompiler(operators, engines, validators);
    expect(() => compiler.compile(scenario("missing"))).toThrow(/not registered/);
    expect(() => compiler.compile(scenario("safe"))).toThrow(/semantic-parsing/);

    const complete = new ScenarioCompiler(createDefaultOperatorRegistry(), engines, validators);
    const parallel = scenario("safe"); parallel.decoders.order = ["safe", "unsafe"]; parallel.decoders.execution = "parallel";
    expect(() => complete.compile(parallel)).not.toThrow();
    const quality = scenario("safe"); quality.quality.minimumHeuristicQuality = 0.5;
    expect(() => complete.compile(quality)).toThrow(/unsupported/);
    const requiredValidator = scenario("safe"); requiredValidator.validation = [{ id: "sku", required: true }];
    expect(() => complete.compile(requiredValidator)).toThrow(/not registered/);
  });

  it("uses a bounded graph cache", () => {
    const engines = new EngineRegistry(); engines.register(new FakeEngine());
    const compiler = new ScenarioCompiler(createDefaultOperatorRegistry(), engines, new ValidatorRegistry(), { maxCacheEntries: 2 });
    for (let revision = 1; revision <= 3; revision++) { const value = scenario(); value.revision = revision; compiler.compile(value); }
    expect(compiler.cacheSize).toBe(2);
  });
});
