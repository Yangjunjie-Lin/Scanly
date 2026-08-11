import { describe, expect, it, vi } from "vitest";
import { sdkError, type NormalizedFrame, type ScanOutcome, type ScanResult } from "@scanly/core";
import { BoundedDecodeEscalation, DeterministicFrameSequenceSource, FrameQualityAnalyzer, FrameScheduler, RepeatSuppressor, ScannerSession, TemporalCandidateStore, TemporalROI, type ScannerFrameDecoder } from "@scanly/browser";

function frame(index: number, timestampMs = index * 40): NormalizedFrame {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < data.length; i += 4) { const on = (i / 4 + index) % 2 === 0; data[i] = on ? 20 : 235; data[i + 1] = data[i]; data[i + 2] = data[i]; data[i + 3] = 255; }
  return { id: `sequence-${index}`, timestampMs, width: 32, height: 32, rowStride: 128, pixelFormat: "rgba8888", orientation: 0, sourceType: "camera", data, ownership: "owned", dispose: vi.fn() };
}

function result(frameId: string, text = "BETA-1", x = 8): ScanResult {
  return { format: "qr_code", rawText: text, cornerPoints: [{ x, y: 8 }, { x: x + 12, y: 8 }, { x: x + 12, y: 20 }, { x, y: 20 }], engine: { id: "jsqr", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
}

function success(frameId: string, scanResult = result(frameId)): ScanOutcome {
  return { ok: true, results: [scanResult], primary: scanResult, frameId, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1, controlledMemory: { currentControlledBytes: 0, peakControlledBytes: 4, retainedArtifactBytes: 0, retainedCacheBytes: 0, transientScratchBytes: 0 } } };
}

class FakeDecoder implements ScannerFrameDecoder {
  calls: Array<{ profile: string; roi?: unknown }> = [];
  constructor(private readonly outcome: (frame: NormalizedFrame, profile: string) => ScanOutcome = (input) => success(input.id)) {}
  async decode(input: NormalizedFrame, request: { profile: "fast" | "balanced" | "robust"; quality: ReturnType<FrameQualityAnalyzer["analyze"]>; roi?: unknown; signal: AbortSignal; generation: number }): Promise<ScanOutcome> { this.calls.push({ profile: request.profile, roi: request.roi }); return this.outcome(input, request.profile); }
  cancel(): void {}
  dispose(): void {}
  getStatistics() { return { workerCreatedCount: 1, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 1 }; }
}

describe("FrameQualityAnalyzer", () => {
  it("returns measurable exposure, contrast, glare, blur and motion signals", () => {
    const analyzer = new FrameQualityAnalyzer({ blurThreshold: 0, contrastThreshold: 0 });
    const quality = analyzer.analyze(frame(1));
    expect(quality.brightness).toBeGreaterThan(0);
    expect(quality.contrast).toBeGreaterThan(0);
    expect(quality.edgeDensity).toBeGreaterThan(0);
    expect(quality.usable).toBe(true);
    expect(analyzer.analyze(frame(2)).motionEstimate).toBeDefined();
  });
});

describe("FrameScheduler", () => {
  it("keeps one active decode and retains only the newest pending frame", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const seen: string[] = [];
    let dropped = 0;
    const scheduler = new FrameScheduler(async (input) => { seen.push(input.id); if (seen.length === 1) await blocked; return { decodeMs: 1, success: true }; }, { initialDecodeFps: 15, onDropped: () => { dropped += 1; } });
    scheduler.start(); scheduler.submit(frame(1)); scheduler.submit(frame(2)); scheduler.submit(frame(3));
    expect(scheduler.getStatistics().active).toBe(1); expect(scheduler.getStatistics().pending).toBe(1); expect(scheduler.getStatistics().peakPending).toBe(1);
    release(); await scheduler.waitForIdle(); expect(seen).toEqual(["sequence-1", "sequence-3"]); expect(dropped).toBe(1); await scheduler.stop();
  });
  it("releases the pre-pause pending frame and never decodes it after resume", async () => {
    let releaseActive!: () => void;
    const activeGate = new Promise<void>((resolve) => { releaseActive = resolve; });
    const seen: string[] = [];
    let dropped = 0;
    const scheduler = new FrameScheduler(async (input) => {
      seen.push(input.id);
      if (input.id === "sequence-1") await activeGate;
      input.dispose?.();
      return { decodeMs: 1, success: true };
    }, { initialDecodeFps: 15, onDropped: () => { dropped += 1; } });
    const pending = frame(2);
    scheduler.start(); scheduler.submit(frame(1)); scheduler.submit(pending);
    expect(scheduler.getStatistics().pending).toBe(1);
    scheduler.pause();
    expect(scheduler.getStatistics().pending).toBe(0);
    expect((pending.dispose as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    scheduler.resume(); releaseActive(); await scheduler.waitForIdle();
    scheduler.submit(frame(3)); await scheduler.waitForIdle();
    expect(seen).toEqual(["sequence-1", "sequence-3"]); expect(dropped).toBe(1); await scheduler.stop();
  });
});

describe("bounded decode escalation", () => {
  it("eventually performs a bounded robust probe without an existing ROI", () => {
    const policy = new BoundedDecodeEscalation({ balancedEveryMisses: 2, robustAfterMisses: 4, robustCooldownFrames: 8 });
    const quality = { blurScore: 1, brightness: .5, contrast: 1, glareRatio: 0, edgeDensity: 1, underexposed: false, overexposed: false, blurred: false, glareDominated: false, usable: true };
    const profiles = Array.from({ length: 12 }, (_, i) => { const selected = policy.select(quality, false, i * 1000); policy.observe(false, i * 1000); return selected; });
    expect(profiles).toContain("balanced"); expect(profiles).toContain("robust");
  });
});

describe("temporal confirmation and repeat policy", () => {
  it("confirms a candidate on two observations and suppresses repeat events", () => {
    const analyzer = new FrameQualityAnalyzer({ blurThreshold: 0, contrastThreshold: 0 }); const quality = analyzer.analyze(frame(1));
    const barcode = { text: "same", format: "qr_code" as const, formatClass: "matrix" as const, engineId: "zxing-js" };
    const geometry = { cornerPoints: [{ x: 1, y: 1 }], boundingBox: { x: 1, y: 1, width: 5, height: 5 } };
    const store = new TemporalCandidateStore({ mode: "confirm-two" });
    expect(store.observe(barcode, geometry, quality, 0).newlyConfirmed).toBe(false);
    expect(store.observe(barcode, geometry, quality, 100).newlyConfirmed).toBe(true);
    const suppressor = new RepeatSuppressor({ mode: "once-per-session" });
    expect(suppressor.evaluate(barcode, geometry, 100).emit).toBe(true);
    expect(suppressor.evaluate(barcode, geometry, 200).emit).toBe(false);
  });
  it("distinguishes equal payloads at spatially separated physical instances", () => {
    const barcode = { text: "same", format: "upc_a" as const, formatClass: "linear" as const, engineId: "zxing-js" };
    const suppressor = new RepeatSuppressor({ mode: "physical-instance", cooldownMs: 0, spatialSeparationRatio: 0.5 });
    const first = suppressor.evaluate(barcode, { cornerPoints: [], boundingBox: { x: 1, y: 1, width: 4, height: 4 } }, 0);
    const second = suppressor.evaluate(barcode, { cornerPoints: [], boundingBox: { x: 20, y: 1, width: 4, height: 4 } }, 10);
    expect(first.emit).toBe(true); expect(second.emit).toBe(true); expect(second.physicalInstanceId).not.toBe(first.physicalInstanceId);
  });
});

describe("ScannerSession", () => {
  it("publishes every valid multi-code result as one frame observation set", async () => {
    const source = new DeterministicFrameSequenceSource(function* () { yield frame(1); });
    const decoder = new FakeDecoder((input) => {
      const first = result(input.id, "MULTI-A", 2);
      const second = result(input.id, "MULTI-B", 18);
      return { ...success(input.id, first), results: [first, second] };
    });
    const session = new ScannerSession({ source, decoder, confirmation: { mode: "immediate" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
    const sets: Array<{ frameId: number; payloads: string[] }> = [];
    session.onObservations((set) => sets.push({ frameId: set.frameId, payloads: set.observations.map((observation) => observation.barcode.text) }));
    await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(sets).toEqual([{ frameId: 1, payloads: ["MULTI-A", "MULTI-B"] }]);
    await session.dispose();
  });

  it("runs a deterministic source, confirms, emits once, and disposes all frames", async () => {
    const frames = Array.from({ length: 6 }, (_, index) => frame(index)); const source = new DeterministicFrameSequenceSource(() => frames);
    const decoder = new FakeDecoder(); const session = new ScannerSession({ source, decoder, confirmation: { mode: "confirm-two" }, repeatPolicy: { mode: "once-per-session" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
    const emitted: string[] = []; session.onResult((event) => emitted.push(event.barcode.text));
    await session.start();
    await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(session.getState()).toBe("stopped");
    expect(emitted).toEqual(["BETA-1"]);
    const stats = session.getStatistics();
    expect(stats.confirmedEvents).toBeGreaterThanOrEqual(1); expect(stats.emittedEvents).toBe(1); expect(stats.suppressedRepeats).toBeGreaterThan(0); expect(stats.staleEvents).toBe(0); expect(stats.finalControlledMemory).toBe(0);
    expect(frames.every((input) => (input.dispose as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(true);
    await session.dispose();
  });
  it("has no late events after stop and supports pause/resume", async () => {
    let resolve!: () => void;
    const source = new DeterministicFrameSequenceSource(async function* () { yield frame(1); await new Promise<void>((r) => { resolve = r; }); yield frame(2); });
    const session = new ScannerSession({ source, decoder: new FakeDecoder(), confirmation: { mode: "immediate" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
    const listener = vi.fn(); session.onResult(listener); await session.start(); await new Promise<void>((r) => setTimeout(r, 0)); session.pause(); expect(session.getState()).toBe("paused"); resolve(); await session.stop();
    expect(listener).toHaveBeenCalledTimes(1); expect(session.getStatistics().staleEvents).toBe(0);
  });
  it("counts and blocks a public-event attempt after re-entrant generation invalidation", async () => {
    let releaseFrame!: () => void;
    const frameGate = new Promise<void>((resolve) => { releaseFrame = resolve; });
    const source = new DeterministicFrameSequenceSource(async function* () { await frameGate; yield frame(1); });
    const decoder = new FakeDecoder((input) => {
      const first = result(input.id, "FIRST", 2); const second = result(input.id, "SECOND", 18);
      return { ...success(input.id, first), results: [first, second] };
    });
    const session = new ScannerSession({ source, decoder, confirmation: { mode: "immediate" }, repeatPolicy: { mode: "allow" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
    const listener = vi.fn(() => session.pause()); session.onResult(listener);
    await session.start(); releaseFrame(); await source.finished(); await session.stop();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getStatistics()).toMatchObject({ emittedEvents: 1, staleEvents: 1 });
  });
  it("isolates an engine exception and keeps the session usable", async () => {
    let calls = 0;
    const source = new DeterministicFrameSequenceSource(function* () { yield frame(1); yield frame(2); });
    const decoder = new FakeDecoder((input) => { calls += 1; if (calls === 1) throw new Error("engine exploded"); return success(input.id); });
    const session = new ScannerSession({ source, decoder, confirmation: { mode: "immediate" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
    const errors: string[] = []; session.onDiagnostics((diagnostic) => { if (diagnostic.error) errors.push(diagnostic.error.code); });
    await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(errors).toContain("engine_execution_failure"); expect(session.getState()).toBe("stopped"); expect(session.getStatistics().staleEvents).toBe(0);
  });
  it("emits a lost diagnostic before a re-entry can be confirmed", async () => {
    const source = new DeterministicFrameSequenceSource(function* () { yield frame(1, 0); yield frame(2, 100); yield frame(3, 2_000); yield frame(4, 2_100); });
    const decoder = new FakeDecoder((input) => input.id === "sequence-2" || input.id === "sequence-3" ? success(input.id) : { ok: false, error: sdkError("no_symbol_found", "miss"), frameId: input.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } });
    const session = new ScannerSession({ source, decoder, confirmation: { mode: "immediate", lostAfterMs: 500 }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
    const events: string[] = []; session.onDiagnostics((diagnostic) => { if (diagnostic.event) events.push(diagnostic.event.type); });
    await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(events).toContain("lost"); await session.dispose();
  });
  it("rejects unusable frames but retains a configurable periodic probe", async () => {
    const dark = (index: number) => ({ ...frame(index), data: new Uint8ClampedArray(32 * 32 * 4), dispose: vi.fn() });
    const source = new DeterministicFrameSequenceSource(function* () { for (let index = 0; index < 4; index += 1) yield dark(index); });
    const decoder = new FakeDecoder((input) => ({ ok: false, error: sdkError("no_symbol_found", "probe miss"), frameId: input.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } }));
    const session = new ScannerSession({ source, decoder, qualityProbeInterval: 2 }); await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(session.getStatistics()).toMatchObject({ capturedFrames: 4, qualityRejectedFrames: 2, periodicProbeFrames: 2 }); expect(decoder.calls).toHaveLength(2); await session.dispose();
  });
});

describe("TemporalROI", () => {
  it("reuses a successful region and expires it after misses", () => {
    const roi = new TemporalROI({ maximumMisses: 2 }); const scan = result("1");
    roi.update(scan, { width: 32, height: 32, orientation: 0 }, 0);
    expect(roi.hint({ width: 32, height: 32, orientation: 0 }, 50)?.width).toBeGreaterThan(0);
    roi.miss(); roi.miss(); expect(roi.active).toBe(false);
  });
});
