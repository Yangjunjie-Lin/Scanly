import type { BarcodeObservationSet, ScannerDiagnostic, ScannerSessionState, Unsubscribe } from "../scanner/types.js";
import type { ScannerSession } from "../scanner/scanner-session.js";
import { BarcodeTracker } from "../tracking/barcode-tracker.js";
import type {
  BarcodeObservation,
  BarcodeTrack,
  BarcodeTrackerOptions,
  BarcodeTrackerUpdate,
  TrackingFrame,
} from "../tracking/types.js";
import { BatchController, type BatchControllerOptions } from "./batch-controller.js";
import type {
  BatchEventListener,
  BatchState,
  BatchStatistics,
  BatchUnsubscribe,
  TrackListener,
} from "./types.js";

export interface BatchScanSessionOptions extends BatchControllerOptions {
  /** Existing camera runtime; BatchScanSession never creates a second one. */
  scanner: ScannerSession;
  tracker?: BarcodeTracker;
  trackerOptions?: BarcodeTrackerOptions;
  /** Defaults to true because BatchScanSession owns the delegated lifecycle. */
  disposeScanner?: boolean;
  /** Defaults to true for both injected and internally-created trackers. */
  disposeTracker?: boolean;
}

interface PendingScannerFrame {
  timestamp: number;
  observations: BarcodeObservation[];
  generation: number;
  scheduled: boolean;
}

/**
 * ScannerSession + BarcodeTracker + BatchController composition. React and
 * other UI layers only subscribe to the resulting SDK state.
 */
export class BatchScanSession {
  private readonly scanner: ScannerSession;
  private readonly tracker: BarcodeTracker;
  private readonly controller: BatchController;
  private readonly disposeScanner: boolean;
  private readonly disposeTracker: boolean;
  private readonly subscriptions: Unsubscribe[];
  private readonly pendingScannerFrames = new Map<number, PendingScannerFrame>();
  private generation = 0;
  private stopRequested = false;
  private disposed = false;

  constructor(options: BatchScanSessionOptions) {
    this.scanner = options.scanner;
    this.tracker = options.tracker ?? new BarcodeTracker(options.trackerOptions);
    this.controller = new BatchController(options);
    this.disposeScanner = options.disposeScanner ?? true;
    this.disposeTracker = options.disposeTracker ?? true;
    const observationSubscription = typeof this.scanner.onObservations === "function"
      ? this.scanner.onObservations((set) => this.observeScannerObservationSet(set))
      : this.scanner.onDiagnostics((diagnostic) => this.observeScannerDiagnostic(diagnostic));
    this.subscriptions = [observationSubscription, this.scanner.onStateChange((state) => this.observeScannerState(state))];
  }

  async start(): Promise<void> {
    this.assertUsable();
    const state = this.scanner.getState();
    if (state === "starting" || state === "scanning" || state === "paused") return;
    this.generation += 1;
    this.pendingScannerFrames.clear();
    this.tracker.reset();
    this.controller.reset();
    this.stopRequested = false;
    try {
      await this.scanner.start();
    } catch (error) {
      this.controller.fail(error);
      throw error;
    }
  }

  pause(): void {
    if (this.disposed || this.scanner.getState() !== "scanning") return;
    this.invalidatePendingFrames();
    this.scanner.pause();
  }

  resume(): void {
    if (this.disposed || this.scanner.getState() !== "paused") return;
    this.scanner.resume();
  }

  async stop(): Promise<void> {
    if (this.disposed) return;
    this.stopRequested = true;
    this.invalidatePendingFrames();
    await this.scanner.stop();
    if (this.controller.getState().status === "collecting") this.controller.cancel();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.stop();
    this.disposed = true;
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
    if (this.disposeTracker) this.tracker.dispose();
    if (this.disposeScanner) await this.scanner.dispose();
    this.pendingScannerFrames.clear();
    this.controller.clear();
  }

  getTracks(): readonly BarcodeTrack[] {
    return this.tracker.getTracks();
  }

  getBatchState(): BatchState {
    return this.controller.getState();
  }

  getStatistics(): BatchStatistics {
    return this.controller.getStatistics();
  }

  onTrack(listener: TrackListener): BatchUnsubscribe {
    return this.controller.onTrack(listener);
  }

  onBatchEvent(listener: BatchEventListener): BatchUnsubscribe {
    return this.controller.onEvent(listener);
  }

  /** Explicit frame API used by deterministic runtimes and custom capture adapters. */
  processFrame(observations: readonly BarcodeObservation[], frame: TrackingFrame): BarcodeTrackerUpdate {
    this.assertUsable();
    const update = this.tracker.observeFrame(observations, frame);
    this.controller.applyTrackerUpdate(update);
    return update;
  }

  /** Accept an update from an externally-driven instance of the same tracker. */
  applyTrackerUpdate(update: BarcodeTrackerUpdate): void {
    this.assertUsable();
    this.controller.applyTrackerUpdate(update);
  }

  private observeScannerDiagnostic(diagnostic: ScannerDiagnostic): void {
    if (this.disposed || !diagnostic.event || diagnostic.frameId === undefined) return;
    if (diagnostic.event.type !== "detected" && diagnostic.event.type !== "lost") return;
    if (this.scanner.getState() !== "starting" && this.scanner.getState() !== "scanning") return;

    const frameId = diagnostic.frameId;
    const pending = this.pendingScannerFrames.get(frameId) ?? {
      timestamp: diagnostic.timestamp,
      observations: [],
      generation: this.generation,
      scheduled: false,
    };
    pending.timestamp = Math.max(pending.timestamp, diagnostic.timestamp);
    const event = diagnostic.event;
    if (event.type === "detected" && event.geometry) {
      pending.observations.push({
        payload: event.barcode.text,
        format: event.barcode.format,
        geometry: event.geometry,
      });
    }
    this.pendingScannerFrames.set(frameId, pending);
    if (pending.scheduled) return;
    pending.scheduled = true;
    queueMicrotask(() => this.flushScannerFrame(frameId, pending));
  }

  private observeScannerObservationSet(set: BarcodeObservationSet): void {
    if (this.disposed || (this.scanner.getState() !== "starting" && this.scanner.getState() !== "scanning")) return;
    const observations: BarcodeObservation[] = set.observations.flatMap((observation) => observation.geometry ? [{
      payload: observation.barcode.text,
      format: observation.barcode.format,
      geometry: observation.geometry,
    }] : []);
    try {
      this.processFrame(observations, { frameId: set.frameId, timestamp: set.timestamp });
    } catch (error) {
      this.controller.fail(error);
    }
  }

  private flushScannerFrame(frameId: number, pending: PendingScannerFrame): void {
    if (this.pendingScannerFrames.get(frameId) !== pending) return;
    this.pendingScannerFrames.delete(frameId);
    if (this.disposed || pending.generation !== this.generation) return;
    if (this.scanner.getState() !== "starting" && this.scanner.getState() !== "scanning") return;
    try {
      this.processFrame(pending.observations, { frameId, timestamp: pending.timestamp });
    } catch (error) {
      this.controller.fail(error);
    }
  }

  private observeScannerState(state: ScannerSessionState): void {
    if (this.disposed) return;
    if (state === "failed") {
      this.invalidatePendingFrames();
      this.controller.fail(new Error("ScannerSession failed while collecting a batch."));
      return;
    }
    if (state === "stopped" && !this.stopRequested && this.controller.getState().status === "collecting") {
      this.invalidatePendingFrames();
      this.controller.cancel();
    }
  }

  private invalidatePendingFrames(): void {
    this.generation += 1;
    this.pendingScannerFrames.clear();
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("BatchScanSession has been disposed.");
  }
}
