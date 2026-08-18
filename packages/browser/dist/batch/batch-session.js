import { BarcodeTracker } from "../tracking/barcode-tracker.js";
import { BatchController } from "./batch-controller.js";
/**
 * ScannerSession + BarcodeTracker + BatchController composition. React and
 * other UI layers only subscribe to the resulting SDK state.
 */
export class BatchScanSession {
    scanner;
    tracker;
    controller;
    disposeScanner;
    disposeTracker;
    subscriptions;
    pendingScannerFrames = new Map();
    generation = 0;
    stopRequested = false;
    disposed = false;
    constructor(options) {
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
    async start() {
        this.assertUsable();
        const state = this.scanner.getState();
        if (state === "starting" || state === "scanning" || state === "paused")
            return;
        this.generation += 1;
        this.pendingScannerFrames.clear();
        this.tracker.reset();
        this.controller.reset();
        this.stopRequested = false;
        try {
            await this.scanner.start();
        }
        catch (error) {
            this.controller.fail(error);
            throw error;
        }
    }
    pause() {
        if (this.disposed || this.scanner.getState() !== "scanning")
            return;
        this.invalidatePendingFrames();
        this.scanner.pause();
    }
    resume() {
        if (this.disposed || this.scanner.getState() !== "paused")
            return;
        this.scanner.resume();
    }
    async stop() {
        if (this.disposed)
            return;
        this.stopRequested = true;
        this.invalidatePendingFrames();
        const errors = [];
        try {
            await this.scanner.stop();
        }
        catch (error) {
            errors.push(error);
            this.controller.fail(error);
        }
        finally {
            // A ScannerSession implementation may reject before changing state.
            // Keep the generation closed so late observation callbacks cannot mutate
            // the terminal batch state.
            this.invalidatePendingFrames();
            try {
                this.tracker.reset();
            }
            catch (error) {
                errors.push(error);
                this.controller.fail(error);
            }
            if (errors.length === 0 && this.controller.getState().status === "collecting")
                this.controller.cancel();
            try {
                this.controller.releaseRetainedState();
            }
            catch (error) {
                errors.push(error);
            }
        }
        if (errors.length === 1)
            throw errors[0];
        if (errors.length > 1)
            throw new AggregateError(errors, "BatchScanSession stop failed after attempting runtime cleanup.");
    }
    async dispose() {
        if (this.disposed)
            return;
        // Close callbacks before awaiting fallible delegated lifecycle methods.
        this.disposed = true;
        this.stopRequested = true;
        this.invalidatePendingFrames();
        const errors = [];
        try {
            await this.scanner.stop();
        }
        catch (error) {
            errors.push(error);
        }
        finally {
            if (this.controller.getState().status === "collecting")
                this.controller.cancel();
            for (const unsubscribe of this.subscriptions.splice(0)) {
                try {
                    unsubscribe();
                }
                catch (error) {
                    errors.push(error);
                }
            }
            if (this.disposeTracker) {
                // Reset first so an injected/fallible dispose implementation cannot
                // strand live identities owned by this composition.
                try {
                    this.tracker.reset();
                }
                catch (error) {
                    errors.push(error);
                }
                try {
                    this.tracker.dispose();
                }
                catch (error) {
                    errors.push(error);
                }
            }
            this.pendingScannerFrames.clear();
            try {
                this.controller.clear();
            }
            catch (error) {
                errors.push(error);
            }
            if (this.disposeScanner) {
                try {
                    await this.scanner.dispose();
                }
                catch (error) {
                    errors.push(error);
                }
            }
        }
        if (errors.length === 1)
            throw errors[0];
        if (errors.length > 1)
            throw new AggregateError(errors, "BatchScanSession disposal failed after completing all cleanup steps.");
    }
    getTracks() {
        return this.tracker.getTracks();
    }
    getBatchState() {
        return this.controller.getState();
    }
    getStatistics() {
        return this.controller.getStatistics();
    }
    onTrack(listener) {
        return this.controller.onTrack(listener);
    }
    onBatchEvent(listener) {
        return this.controller.onEvent(listener);
    }
    /** Explicit frame API used by deterministic runtimes and custom capture adapters. */
    processFrame(observations, frame) {
        this.assertUsable();
        const update = this.tracker.observeFrame(observations, frame);
        this.controller.applyTrackerUpdate(update);
        return update;
    }
    /** Accept an update from an externally-driven instance of the same tracker. */
    applyTrackerUpdate(update) {
        this.assertUsable();
        this.controller.applyTrackerUpdate(update);
    }
    observeScannerDiagnostic(diagnostic) {
        if (this.disposed || this.stopRequested || !diagnostic.event || diagnostic.frameId === undefined)
            return;
        if (diagnostic.event.type !== "detected" && diagnostic.event.type !== "lost")
            return;
        if (this.scanner.getState() !== "starting" && this.scanner.getState() !== "scanning")
            return;
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
        if (pending.scheduled)
            return;
        pending.scheduled = true;
        queueMicrotask(() => this.flushScannerFrame(frameId, pending));
    }
    observeScannerObservationSet(set) {
        if (this.disposed || this.stopRequested || (this.scanner.getState() !== "starting" && this.scanner.getState() !== "scanning"))
            return;
        const observations = set.observations.flatMap((observation) => observation.geometry ? [{
                payload: observation.barcode.text,
                format: observation.barcode.format,
                geometry: observation.geometry,
            }] : []);
        try {
            this.processFrame(observations, { frameId: set.frameId, timestamp: set.timestamp });
        }
        catch (error) {
            this.controller.fail(error);
        }
    }
    flushScannerFrame(frameId, pending) {
        if (this.pendingScannerFrames.get(frameId) !== pending)
            return;
        this.pendingScannerFrames.delete(frameId);
        if (this.disposed || this.stopRequested || pending.generation !== this.generation)
            return;
        if (this.scanner.getState() !== "starting" && this.scanner.getState() !== "scanning")
            return;
        try {
            this.processFrame(pending.observations, { frameId, timestamp: pending.timestamp });
        }
        catch (error) {
            this.controller.fail(error);
        }
    }
    observeScannerState(state) {
        if (this.disposed)
            return;
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
    invalidatePendingFrames() {
        this.generation += 1;
        this.pendingScannerFrames.clear();
    }
    assertUsable() {
        if (this.disposed)
            throw new Error("BatchScanSession has been disposed.");
    }
}
//# sourceMappingURL=batch-session.js.map