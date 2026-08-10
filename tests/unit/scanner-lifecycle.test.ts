import { describe, expect, it, vi } from "vitest";
import { createRgbaFrame } from "@scanly/core";
import { ScannerSession } from "../../packages/browser/src/scanner/scanner-session";
import { DeterministicFrameSequenceSource } from "../../packages/browser/src/scanner/frame-source";
import type { CameraFrameSource } from "../../packages/browser/src/scanner/types";
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

it("switches a running camera source without retaining the old source", async () => {
  class Source implements CameraFrameSource { starts = 0; stops = 0; async start(): Promise<void> { this.starts += 1; } stop(): void { this.stops += 1; } }
  const first = new Source(); const second = new Source(); const session = new ScannerSession({ source: first });
  await session.start(); expect(session.getState()).toBe("scanning"); await session.switchSource(second); expect(first.stops).toBe(1); expect(second.starts).toBe(1); expect(session.getState()).toBe("scanning"); await session.stop();
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
