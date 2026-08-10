import { describe, expect, it, vi } from "vitest";
import { BatchScanSession } from "../../packages/browser/src/batch/batch-session.js";
import { BarcodeTracker } from "../../packages/browser/src/tracking/barcode-tracker.js";
import type { ScannerSession } from "../../packages/browser/src/scanner/scanner-session.js";
import type { BarcodeGeometry, BarcodeObservationSet, BarcodeObservationSetListener, ScannerDiagnostic, ScannerSessionState } from "../../packages/browser/src/scanner/types.js";

class FakeScannerSession {
  private state: ScannerSessionState = "idle";
  private readonly stateListeners = new Set<(state: ScannerSessionState) => void>();
  private readonly diagnosticListeners = new Set<(diagnostic: ScannerDiagnostic) => void>();
  private readonly observationListeners = new Set<BarcodeObservationSetListener>();
  readonly calls: string[] = [];

  getState(): ScannerSessionState { return this.state; }
  async start(): Promise<void> { this.calls.push("start"); this.setState("starting"); this.setState("scanning"); }
  pause(): void { this.calls.push("pause"); this.setState("paused"); }
  resume(): void { this.calls.push("resume"); this.setState("scanning"); }
  async stop(): Promise<void> { this.calls.push("stop"); this.setState("stopped"); }
  async dispose(): Promise<void> { this.calls.push("dispose"); }
  onStateChange(listener: (state: ScannerSessionState) => void): () => void { this.stateListeners.add(listener); return () => this.stateListeners.delete(listener); }
  onDiagnostics(listener: (diagnostic: ScannerDiagnostic) => void): () => void { this.diagnosticListeners.add(listener); return () => this.diagnosticListeners.delete(listener); }
  onObservations(listener: BarcodeObservationSetListener): () => void { this.observationListeners.add(listener); return () => this.observationListeners.delete(listener); }
  emitDiagnostic(diagnostic: ScannerDiagnostic): void { for (const listener of this.diagnosticListeners) listener(diagnostic); }
  emitObservations(set: BarcodeObservationSet): void { for (const listener of this.observationListeners) listener(set); }
  fail(): void { this.setState("failed"); }

  private setState(state: ScannerSessionState): void {
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }
}

function geometry(x: number): BarcodeGeometry {
  return {
    cornerPoints: [{ x, y: 10 }, { x: x + 20, y: 10 }, { x: x + 20, y: 30 }, { x, y: 30 }],
    boundingBox: { x, y: 10, width: 20, height: 20 },
    frameWidth: 200,
    frameHeight: 100,
  };
}

describe("BatchScanSession", () => {
  it("composes one ScannerSession with one BarcodeTracker and consumes a complete multi-code observation set", async () => {
    const scanner = new FakeScannerSession();
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    const session = new BatchScanSession({ scanner: scanner as unknown as ScannerSession, tracker, mode: "expected-count", expectedCount: 2 });
    const events: string[] = [];
    session.onBatchEvent((event) => events.push(event.type));

    await session.start();
    scanner.emitObservations({
      frameId: 1,
      timestamp: 40,
      frameWidth: 200,
      frameHeight: 100,
      generation: 1,
      quality: { blurScore: 1, brightness: 0.5, contrast: 1, glareRatio: 0, edgeDensity: 1, underexposed: false, overexposed: false, blurred: false, glareDominated: false, usable: true },
      observations: [10, 140].map((x) => ({
        barcode: { text: "012345678905", format: "upc_a", formatClass: "linear", engineId: "test" },
        frameId: 1,
        timestamp: 40,
        geometry: geometry(x),
      })),
    });

    expect(session.getTracks()).toHaveLength(2);
    expect(new Set(session.getTracks().map((track) => track.physicalInstanceId)).size).toBe(2);
    expect(session.getBatchState()).toMatchObject({ status: "complete", confirmedPhysicalInstanceCount: 2 });
    expect(events.filter((type) => type === "track-added")).toHaveLength(2);
    expect(events.filter((type) => type === "batch-completed")).toHaveLength(1);

    session.pause();
    session.resume();
    await session.stop();
    expect(scanner.calls).toEqual(["start", "pause", "resume", "stop"]);
    expect(session.getBatchState().status).toBe("complete");
    await session.dispose();
    expect(scanner.calls).toContain("dispose");
    expect(tracker.getStatistics()).toMatchObject({ activeTrackCount: 0, pendingObservationCount: 0 });
  });

  it("cancels an incomplete collection on stop and rejects use after disposal", async () => {
    const scanner = new FakeScannerSession();
    const session = new BatchScanSession({ scanner: scanner as unknown as ScannerSession, mode: "expected-count", expectedCount: 2 });
    const cancelled = vi.fn();
    session.onBatchEvent((event) => { if (event.type === "batch-cancelled") cancelled(); });
    await session.start();
    await session.stop();
    expect(session.getBatchState().status).toBe("cancelled");
    expect(cancelled).toHaveBeenCalledTimes(1);
    await session.dispose();
    expect(() => session.processFrame([], { frameId: 2, timestamp: 80 })).toThrow(/disposed/);
  });

  it("maps a ScannerSession failure to a failed batch", async () => {
    const scanner = new FakeScannerSession();
    const session = new BatchScanSession({ scanner: scanner as unknown as ScannerSession, mode: "continuous" });
    const failures: string[] = [];
    session.onBatchEvent((event) => { if (event.type === "batch-failed") failures.push(event.state.status); });
    await session.start();
    scanner.fail();
    expect(session.getBatchState()).toMatchObject({ status: "failed", failureReason: expect.stringContaining("ScannerSession failed") });
    expect(failures).toEqual(["failed"]);
    await session.dispose();
  });
});
