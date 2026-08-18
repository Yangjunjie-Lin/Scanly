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
  private onEnded?: () => void;

  async start(_onFrame: Parameters<CameraFrameSource["start"]>[0], _onError: Parameters<CameraFrameSource["start"]>[1], onEnded: () => void): Promise<void> {
    this.starts += 1; this.onEnded = onEnded; await this.startGate;
  }
  stop(): void { this.stops += 1; }
  resolveStart(): void { this.finishStart(); }
  end(): void { this.onEnded?.(); }
}

class RetainedCallbackSource implements CameraFrameSource {
  private onFrame?: Parameters<CameraFrameSource["start"]>[0];
  async start(onFrame: Parameters<CameraFrameSource["start"]>[0]): Promise<void> { this.onFrame = onFrame; }
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
}

class PushFrameSource implements CameraFrameSource {
  starts = 0;
  stops = 0;
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
    const frame = createRgbaFrame(data, 32, 32, { id, timestampMs: 1, sourceType: "camera", ownership: "owned", dispose: vi.fn() });
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
  cancel(): void {}
  dispose(): void {}
  release(): void { this.releaseGate(); }
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
