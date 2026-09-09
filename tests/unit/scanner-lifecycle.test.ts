import { describe, expect, it, vi } from "vitest";
import { createRgbaFrame, sdkError, type NormalizedFrame, type ScanOutcome } from "@scanly/core";
import { ScannerSession } from "../../packages/browser/src/scanner/scanner-session";
import { DeterministicFrameSequenceSource } from "../../packages/browser/src/scanner/frame-source";
import type { CameraFrameSource, ScannerDecodeRequest, ScannerFrameDecoder } from "../../packages/browser/src/scanner/types";
describe("ScannerSession lifecycle contract", () => it("starts idle", () => { const s = new ScannerSession({ source: new DeterministicFrameSequenceSource(function* () {}) }); expect(s.getState()).toBe("idle"); }));

class DeferredStartSource implements CameraFrameSource {
  starts = 0;
  stops = 0;
  private finishStart!: () => void;
  private readonly startGate = new Promise<void>((resolve) => { this.finishStart = resolve; });
  private onFrame?: Parameters<CameraFrameSource["start"]>[0];
  private onError?: Parameters<CameraFrameSource["start"]>[1];
  private onEnded?: () => void;
  private onLifecycle?: Parameters<CameraFrameSource["start"]>[3];

  async start(onFrame: Parameters<CameraFrameSource["start"]>[0], onError: Parameters<CameraFrameSource["start"]>[1], onEnded: () => void, onLifecycle?: Parameters<CameraFrameSource["start"]>[3]): Promise<void> {
    this.starts += 1; this.onFrame = onFrame; this.onError = onError; this.onEnded = onEnded; this.onLifecycle = onLifecycle; await this.startGate;
  }
  stop(): void { this.stops += 1; }
  resolveStart(): void { this.finishStart(); }
  end(): void { this.onEnded?.(); }
  error(error: unknown): void { this.onError?.(error); }
  lifecycle(): void { this.onLifecycle?.({ reason: "orientation-change", timestamp: Date.now() }); }
  emit(id: string) {
    const dispose = vi.fn();
    const frame = createRgbaFrame(new Uint8ClampedArray(4 * 4 * 4), 4, 4, {
      id,
      timestampMs: 1,
      sourceType: "camera",
      ownership: "owned",
      dispose,
    });
    void this.onFrame?.(frame);
    return dispose;
  }
}

class RetainedCallbackSource implements CameraFrameSource {
  private onFrame?: Parameters<CameraFrameSource["start"]>[0];
  private onError?: Parameters<CameraFrameSource["start"]>[1];
  private onEnded?: Parameters<CameraFrameSource["start"]>[2];
  private onLifecycle?: Parameters<CameraFrameSource["start"]>[3];
  async start(onFrame: Parameters<CameraFrameSource["start"]>[0], onError: Parameters<CameraFrameSource["start"]>[1], onEnded: Parameters<CameraFrameSource["start"]>[2], onLifecycle?: Parameters<CameraFrameSource["start"]>[3]): Promise<void> {
    this.onFrame = onFrame; this.onError = onError; this.onEnded = onEnded; this.onLifecycle = onLifecycle;
  }
  stop(): void {}
  emit(id: string) {
    const dispose = vi.fn();
    const frame = createRgbaFrame(new Uint8ClampedArray(4 * 4 * 4), 4, 4, {
      id,
      timestampMs: 1,
      sourceType: "camera",
      ownership: "owned",
      dispose,
    });
    void this.onFrame?.(frame);
    return dispose;
  }
  error(): void { this.onError?.(new Error("late source failure")); }
  end(): void { this.onEnded?.(); }
  lifecycle(): void { this.onLifecycle?.({ reason: "orientation-change", timestamp: Date.now() }); }
}

class PushFrameSource implements CameraFrameSource {
  starts = 0;
  stops = 0;
  lastDispose?: ReturnType<typeof vi.fn>;
  private onFrame?: Parameters<CameraFrameSource["start"]>[0];

  async start(onFrame: Parameters<CameraFrameSource["start"]>[0]): Promise<void> { this.starts += 1; this.onFrame = onFrame; }
  stop(): void { this.stops += 1; }
  emit(id: string): Promise<void> {
    if (!this.onFrame) throw new Error("Source has not started.");
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let index = 0; index < data.length; index += 4) {
      const value = (index / 4) % 2 === 0 ? 20 : 235;
      data[index] = value; data[index + 1] = value; data[index + 2] = value; data[index + 3] = 255;
    }
    const dispose = vi.fn(); this.lastDispose = dispose;
    const frame = createRgbaFrame(data, 32, 32, { id, timestampMs: 1, sourceType: "camera", ownership: "owned", dispose });
    return Promise.resolve(this.onFrame(frame));
  }
}

class DeferredDecoder implements ScannerFrameDecoder {
  private markStarted!: () => void;
  private releaseGate!: () => void;
  readonly started = new Promise<void>((resolve) => { this.markStarted = resolve; });
  private readonly gate = new Promise<void>((resolve) => { this.releaseGate = resolve; });

  async decode(frame: NormalizedFrame, _request: ScannerDecodeRequest): Promise<ScanOutcome> {
    this.markStarted();
    await this.gate;
    return { ok: false, error: sdkError("no_symbol_found", "Deferred test miss."), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
  }
  cancel(): void {}
  dispose(): void {}
  release(): void { this.releaseGate(); }
}

class DeferredSuccessfulDecoder implements ScannerFrameDecoder {
  private markStarted!: () => void;
  private releaseGate!: () => void;
  readonly started = new Promise<void>((resolve) => { this.markStarted = resolve; });
  private readonly gate = new Promise<void>((resolve) => { this.releaseGate = resolve; });

  async decode(frame: NormalizedFrame, _request: ScannerDecodeRequest): Promise<ScanOutcome> {
    this.markStarted();
    await this.gate;
    const primary = {
      format: "qr_code" as const,
      rawText: "SWITCH-DURING-DECODE",
      cornerPoints: [{ x: 8, y: 8 }, { x: 24, y: 8 }, { x: 24, y: 24 }, { x: 8, y: 24 }],
      engine: { id: "deferred-test", version: "1" },
      preprocessingPath: [],
      frameId: frame.id,
      structuredPayload: null,
      validation: { valid: true, validatorIds: [], messages: [] },
      warnings: [],
      timing: { totalMs: 1 },
    };
    return { ok: true, results: [primary], primary, frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
  }
  cancel = vi.fn();
  dispose = vi.fn();
  release(): void { this.releaseGate(); }
}

class RestartableSource implements CameraFrameSource {
  starts = 0;
  stops = 0;
  async start(): Promise<void> { this.starts += 1; }
  stop(): void { this.stops += 1; }
}

class PassiveDecoder implements ScannerFrameDecoder {
  cancel = vi.fn();
  dispose = vi.fn();
  async decode(frame: NormalizedFrame): Promise<ScanOutcome> {
    return { ok: false, error: sdkError("no_symbol_found", "Passive test miss."), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
  }
}

async function captureRejection(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    return error;
  }
}

it("switches a running camera source without retaining the old source", async () => {
  class Source implements CameraFrameSource { starts = 0; stops = 0; async start(): Promise<void> { this.starts += 1; } stop(): void { this.stops += 1; } }
  const first = new Source(); const second = new Source(); const third = new Source(); const session = new ScannerSession({ source: first });
  await session.start(); expect(session.getState()).toBe("scanning"); await session.switchSource(second); expect(first.stops).toBe(1); expect(second.starts).toBe(1); expect(session.getState()).toBe("scanning"); expect(session.getStatistics().cameraGenerationInvalidations).toBe(1);
  await session.switchSource(third); expect(second.stops).toBe(1); expect(third.starts).toBe(1); expect(session.getStatistics().cameraGenerationInvalidations).toBe(2); await session.stop();
});

it("preserves cumulative stale counters across repeated camera switches", async () => {
  class Source implements CameraFrameSource { async start(): Promise<void> {} stop(): void {} }
  const session = new ScannerSession({ source: new Source() });
  await session.start();
  (session as unknown as { counters: { staleResultsDiscarded: number; staleEvents: number } }).counters.staleResultsDiscarded = 2;
  (session as unknown as { counters: { staleResultsDiscarded: number; staleEvents: number } }).counters.staleEvents = 1;
  await session.switchSource(new Source());
  await session.switchSource(new Source());
  expect(session.getStatistics()).toMatchObject({ cameraGenerationInvalidations: 2, staleResultsDiscarded: 2, staleEvents: 1 });
  await session.dispose();
});

it("preserves a stale result completed while source switching drains an in-flight decode", async () => {
  const first = new PushFrameSource(); const second = new PushFrameSource(); const decoder = new DeferredDecoder();
  const session = new ScannerSession({ source: first, decoder, quality: { blurThreshold: 0, contrastThreshold: 0 } });
  await session.start();
  const processing = first.emit("in-flight-old-source");
  await decoder.started;
  const switching = session.switchSource(second);
  expect(session.getState()).toBe("stopping");
  decoder.release();
  await Promise.all([processing, switching]);
  expect(session.getState()).toBe("scanning");
  expect(first.stops).toBe(1); expect(second.starts).toBe(1);
  expect(session.getStatistics()).toMatchObject({ cameraGenerationInvalidations: 1, staleResultsDiscarded: 1, staleEvents: 0, emittedEvents: 0 });
  await session.dispose();
});

it("preserves a stale event raised while a re-entrant source switch drains the active decode", async () => {
  const first = new PushFrameSource(); const second = new PushFrameSource(); const decoder = new DeferredSuccessfulDecoder();
  const session = new ScannerSession({ source: first, decoder, confirmation: { mode: "immediate" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
  let switching: Promise<void> | undefined;
  session.onObservations(() => { switching = session.switchSource(second); });
  await session.start();
  const processing = first.emit("re-entrant-old-source");
  await decoder.started;
  decoder.release();
  await processing;
  expect(switching).toBeDefined();
  await switching;
  expect(session.getState()).toBe("scanning");
  expect(first.stops).toBe(1); expect(second.starts).toBe(1);
  expect(session.getStatistics()).toMatchObject({ cameraGenerationInvalidations: 1, staleResultsDiscarded: 0, staleEvents: 1, emittedEvents: 0 });
  await session.dispose();
});

it("releases late frames from an invalidated source generation", async () => {
  const first = new RetainedCallbackSource(); const second = new RetainedCallbackSource();
  const session = new ScannerSession({ source: first });
  await session.start(); await session.switchSource(second);
  const dispose = first.emit("late-old-source"); await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
  expect(session.getStatistics()).toMatchObject({ capturedFrames: 0, admittedFrames: 0 });
  await session.dispose();
});

it("does not let a pending start completion overwrite stop", async () => {
  const source = new DeferredStartSource(); const session = new ScannerSession({ source });
  const states: string[] = []; session.onStateChange((state) => states.push(state));
  const starting = session.start(); expect(session.getState()).toBe("starting");
  const stopping = session.stop(); source.resolveStart(); await Promise.all([starting, stopping]);
  expect(session.getState()).toBe("stopped"); expect(states).toEqual(["starting", "stopping", "stopped"]); expect(source.stops).toBe(1);
  await session.dispose();
});

it("does not let a pending start completion overwrite dispose", async () => {
  const source = new DeferredStartSource(); const session = new ScannerSession({ source });
  const starting = session.start(); const disposing = session.dispose(); source.resolveStart();
  await Promise.all([starting, disposing]);
  expect(session.getState()).toBe("stopped"); expect(source.stops).toBe(1);
});

it("stops when the source ends before start completes", async () => {
  const source = new DeferredStartSource(); const session = new ScannerSession({ source });
  const states: string[] = []; session.onStateChange((state) => states.push(state));
  const starting = session.start(); source.end(); await Promise.resolve(); source.resolveStart(); await starting; await session.stop();
  expect(session.getState()).toBe("stopped"); expect(states).toEqual(["starting", "stopping", "stopped"]); expect(source.stops).toBe(1);
  await session.dispose();
});

describe("ScannerSession terminal disposal", () => {
  it("LIFE-D1 blocks restart after disposing the default owned decoder", async () => {
    const source = new RestartableSource(); const session = new ScannerSession({ source });
    await session.start(); expect(session.getState()).toBe("scanning");
    await session.dispose();
    const error = await captureRejection(session.start());
    expect(error).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
    expect(session.getState()).not.toBe("scanning");
    await session.stop();
  });

  it("LIFE-D2 makes dispose from idle terminal", async () => {
    const source = new RestartableSource(); const session = new ScannerSession({ source });
    await session.dispose();
    const error = await captureRejection(session.start());
    expect(error).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
    expect(source.starts).toBe(0);
    await session.stop();
  });

  it("LIFE-D3 preserves restart after stop", async () => {
    const source = new RestartableSource(); const session = new ScannerSession({ source });
    await session.start(); await session.stop(); await session.start();
    expect(session.getState()).toBe("scanning");
    expect(source.starts).toBe(2); expect(source.stops).toBe(1);
    await session.dispose();
  });

  it("makes dispose from stopped terminal without stopping the source twice", async () => {
    const source = new RestartableSource(); const session = new ScannerSession({ source });
    await session.start(); await session.stop(); await session.dispose();
    const error = await captureRejection(session.start());
    expect(error).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
    expect(source.starts).toBe(1); expect(source.stops).toBe(1); expect(session.getState()).toBe("stopped");
  });

  it("LIFE-D4 coalesces repeated disposal and owned decoder cleanup", async () => {
    const source = new RestartableSource(); const session = new ScannerSession({ source });
    const ownedDecoder = (session as unknown as { decoder: ScannerFrameDecoder }).decoder;
    const decoderDispose = vi.spyOn(ownedDecoder, "dispose");
    await session.start();
    await Promise.all([session.dispose(), session.dispose()]);
    await session.dispose();
    expect(source.stops).toBe(1);
    expect(decoderDispose).toHaveBeenCalledOnce();
  });

  it("LIFE-D5 keeps dispose terminal when a pending start completes late", async () => {
    const source = new DeferredStartSource(); const session = new ScannerSession({ source });
    const stateListener = vi.fn(); const resultListener = vi.fn(); const observationListener = vi.fn(); const diagnosticListener = vi.fn();
    session.onStateChange(stateListener); session.onResult(resultListener); session.onObservations(observationListener); session.onDiagnostics(diagnosticListener);
    const starting = session.start();
    await session.dispose();
    const listenerCounts = [stateListener, resultListener, observationListener, diagnosticListener].map((listener) => listener.mock.calls.length);
    const release = source.emit("late-pending-start-frame"); source.error(new Error("late")); source.end(); source.lifecycle();
    source.resolveStart(); await starting; await Promise.resolve();
    expect(session.getState()).toBe("stopped");
    expect(release).toHaveBeenCalledOnce();
    expect([stateListener, resultListener, observationListener, diagnosticListener].map((listener) => listener.mock.calls.length)).toEqual(listenerCounts);
    expect(session.getStatistics()).toMatchObject({ activeDecodeCount: 0, pendingFrameCount: 0, emittedEvents: 0 });
  });

  it("LIFE-D6 aborts and drains an active decode without late publication", async () => {
    const source = new PushFrameSource(); const decoder = new DeferredSuccessfulDecoder();
    const session = new ScannerSession({ source, decoder, confirmation: { mode: "immediate" }, quality: { blurThreshold: 0, contrastThreshold: 0 } });
    const resultListener = vi.fn(); const observationListener = vi.fn(); const diagnosticListener = vi.fn(); const stateListener = vi.fn();
    session.onResult(resultListener); session.onObservations(observationListener); session.onDiagnostics(diagnosticListener); session.onStateChange(stateListener);
    await session.start();
    const processing = source.emit("dispose-active-decode"); await decoder.started;
    expect(session.getStatistics().activeDecodeCount).toBe(1);
    const countsAtDispose = [resultListener, observationListener, diagnosticListener, stateListener].map((listener) => listener.mock.calls.length);
    const disposing = session.dispose();
    expect(decoder.cancel).toHaveBeenCalledOnce();
    const restartError = await captureRejection(session.start());
    expect(restartError).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
    decoder.release(); await Promise.all([processing, disposing]);
    expect(source.lastDispose).toHaveBeenCalledOnce();
    expect([resultListener, observationListener, diagnosticListener, stateListener].map((listener) => listener.mock.calls.length)).toEqual(countsAtDispose);
    expect(session.getStatistics()).toMatchObject({ activeDecodeCount: 0, pendingFrameCount: 0, activeTaskCount: 0, emittedEvents: 0, finalControlledMemory: 0 });
  });

  it("LIFE-D7 rejects source switching after dispose", async () => {
    const first = new RestartableSource(); const second = new RestartableSource(); const session = new ScannerSession({ source: first });
    await session.start(); await session.dispose();
    const error = await captureRejection(session.switchSource(second));
    expect(error).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
    expect(second.starts).toBe(0); expect(session.getState()).toBe("stopped");
  });

  it("LIFE-D8 rejects reset after dispose", async () => {
    const session = new ScannerSession({ source: new RestartableSource() });
    await session.dispose();
    let error: unknown;
    try { session.reset(); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
    const startError = await captureRejection(session.start());
    expect(startError).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
  });

  it("LIFE-D9 preserves an injected decoder while making its session terminal", async () => {
    const source = new RestartableSource(); const decoder = new PassiveDecoder(); const session = new ScannerSession({ source, decoder });
    await session.start(); await session.dispose();
    expect(decoder.dispose).not.toHaveBeenCalled();
    const error = await captureRejection(session.start());
    expect(error).toMatchObject({ name: "SdkException", error: { code: "session_disposed" } });
    expect(source.starts).toBe(1); expect(session.getState()).toBe("stopped");
  });

  it("LIFE-D10 clears listeners and suppresses retained source callbacks after dispose", async () => {
    const source = new RetainedCallbackSource(); const session = new ScannerSession({ source });
    const stateListener = vi.fn(); const resultListener = vi.fn(); const observationListener = vi.fn(); const diagnosticListener = vi.fn();
    session.onStateChange(stateListener); session.onResult(resultListener); session.onObservations(observationListener); session.onDiagnostics(diagnosticListener);
    await session.start(); await session.dispose();
    const listenerCounts = [stateListener, resultListener, observationListener, diagnosticListener].map((listener) => listener.mock.calls.length);
    const release = source.emit("late-disposed-frame"); source.error(); source.end(); source.lifecycle(); await Promise.resolve();
    expect(release).toHaveBeenCalledOnce();
    expect([stateListener, resultListener, observationListener, diagnosticListener].map((listener) => listener.mock.calls.length)).toEqual(listenerCounts);
    expect(session.getState()).toBe("stopped");
  });
});
