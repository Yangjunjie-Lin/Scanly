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
  failStop = false;
  failDispose = false;
  failStateUnsubscribe = false;

  getState(): ScannerSessionState { return this.state; }
  async start(): Promise<void> { this.calls.push("start"); this.setState("starting"); this.setState("scanning"); }
  pause(): void { this.calls.push("pause"); this.setState("paused"); }
  resume(): void { this.calls.push("resume"); this.setState("scanning"); }
  async stop(): Promise<void> {
    this.calls.push("stop");
    if (this.failStop) throw new Error("injected scanner stop failure");
    this.setState("stopped");
  }
  async dispose(): Promise<void> {
    this.calls.push("dispose");
    if (this.failDispose) throw new Error("injected scanner dispose failure");
  }
  onStateChange(listener: (state: ScannerSessionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
      if (this.failStateUnsubscribe) throw new Error("injected unsubscribe failure");
    };
  }
  onDiagnostics(listener: (diagnostic: ScannerDiagnostic) => void): () => void { this.diagnosticListeners.add(listener); return () => this.diagnosticListeners.delete(listener); }
  onObservations(listener: BarcodeObservationSetListener): () => void { this.observationListeners.add(listener); return () => this.observationListeners.delete(listener); }
  emitDiagnostic(diagnostic: ScannerDiagnostic): void { for (const listener of this.diagnosticListeners) listener(diagnostic); }
  emitObservations(set: BarcodeObservationSet): void { for (const listener of this.observationListeners) listener(set); }
  fail(): void { this.setState("failed"); }
  get listenerCount(): number { return this.stateListeners.size + this.diagnosticListeners.size + this.observationListeners.size; }

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
    expect(session.getTracks()).toEqual([]);
    expect(session.getStatistics()).toMatchObject({ retainedTrackCount: 0, retainedPhysicalInstanceCount: 0 });
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

  it("invalidates late observations and reaches a failed terminal state when stop rejects", async () => {
    const scanner = new FakeScannerSession();
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    const session = new BatchScanSession({
      scanner: scanner as unknown as ScannerSession,
      tracker,
      mode: "continuous",
    });
    await session.start();
    session.processFrame([{
      payload: "BEFORE-FAILED-STOP",
      format: "qr_code",
      geometry: geometry(10),
    }], { frameId: 1, timestamp: 1 });
    expect(session.getTracks()).toHaveLength(1);
    scanner.failStop = true;

    await expect(session.stop()).rejects.toThrow(/stop failure/);
    expect(session.getBatchState()).toMatchObject({ status: "failed", failureReason: expect.stringContaining("stop failure") });
    expect(session.getTracks()).toEqual([]);
    expect(session.getStatistics()).toMatchObject({ retainedTrackCount: 0, retainedPhysicalInstanceCount: 0 });
    const tracksBeforeLateObservation = session.getTracks();
    scanner.emitObservations({
      frameId: 99,
      timestamp: 99,
      frameWidth: 200,
      frameHeight: 100,
      generation: 1,
      quality: { blurScore: 1, brightness: 0.5, contrast: 1, glareRatio: 0, edgeDensity: 1, underexposed: false, overexposed: false, blurred: false, glareDominated: false, usable: true },
      observations: [{
        barcode: { text: "LATE", format: "qr_code", formatClass: "matrix", engineId: "test" },
        frameId: 99,
        timestamp: 99,
        geometry: geometry(10),
      }],
    });
    expect(session.getTracks()).toEqual(tracksBeforeLateObservation);

    scanner.failStop = false;
    await session.dispose();
    expect(scanner.listenerCount).toBe(0);
  });

  it("attempts every owned cleanup step when stop, tracker dispose, and scanner dispose fail", async () => {
    const scanner = new FakeScannerSession();
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    const session = new BatchScanSession({
      scanner: scanner as unknown as ScannerSession,
      tracker,
      mode: "continuous",
    });
    const eventTypes: string[] = [];
    session.onBatchEvent((event) => eventTypes.push(event.type));
    await session.start();
    session.processFrame([{
      payload: "BEFORE-DISPOSE",
      format: "qr_code",
      geometry: geometry(20),
    }], { frameId: 1, timestamp: 1 });
    scanner.failStop = true;
    scanner.failDispose = true;
    scanner.failStateUnsubscribe = true;
    const trackerDispose = vi.spyOn(tracker, "dispose").mockImplementation(() => {
      throw new Error("injected tracker dispose failure");
    });

    await expect(session.dispose()).rejects.toThrow(/cleanup steps/);
    expect(scanner.calls.filter((call) => call === "stop")).toHaveLength(1);
    expect(scanner.calls.filter((call) => call === "dispose")).toHaveLength(1);
    expect(trackerDispose).toHaveBeenCalledTimes(1);
    expect(scanner.listenerCount).toBe(0);
    expect(tracker.getStatistics()).toMatchObject({ activeTrackCount: 0, lostTrackCount: 0, pendingObservationCount: 0 });
    expect(session.getBatchState()).toMatchObject({
      status: "collecting",
      confirmedPhysicalInstanceCount: 0,
      matched: [],
      unexpected: [],
      duplicate: [],
    });

    const eventCount = eventTypes.length;
    scanner.emitObservations({
      frameId: 100,
      timestamp: 100,
      frameWidth: 200,
      frameHeight: 100,
      generation: 1,
      quality: { blurScore: 1, brightness: 0.5, contrast: 1, glareRatio: 0, edgeDensity: 1, underexposed: false, overexposed: false, blurred: false, glareDominated: false, usable: true },
      observations: [],
    });
    expect(eventTypes).toHaveLength(eventCount);
    expect(() => session.processFrame([], { frameId: 101, timestamp: 101 })).toThrow(/disposed/);
  });
});
