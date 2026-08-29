import { CaptureRouter, IndustrialRecoveryPipeline, ScannerDiagnostics, SdkException, createRecoveryProbeScenario, sdkError, toDecodedBarcode, } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";
import { createBrowserCaptureRouter } from "../runtime.js";
import { DecodeWorkerClient, markDecodePath } from "../worker/worker-client.js";
import { ScannerTrackingRuntime, } from "../tracking/scanner-tracking-runtime.js";
import { CameraCapabilityController } from "./camera-capabilities.js";
import { CameraRecoveryController, cameraError } from "./camera-platform.js";
import { BoundedDecodeEscalation } from "./decode-escalation.js";
import { FrameQualityAnalyzer } from "./frame-quality.js";
import { FrameScheduler } from "./frame-scheduler.js";
import { RepeatSuppressor } from "./repeat-suppressor.js";
import { TemporalCandidateStore } from "./temporal-confirmation.js";
import { TemporalROI } from "./temporal-roi.js";
/** Default decoder composition: persistent Worker with an explicit main-thread fallback. */
export class BrowserScannerFrameDecoder {
    router;
    ownsRouter;
    worker;
    useWorker;
    baseScenario;
    recovery;
    recoveryPipeline = new IndustrialRecoveryPipeline();
    mainRecoveryRunCount = 0;
    mainRecoveryTemporaryBytes = 0;
    mainRecoveryPeakTemporaryBytes = 0;
    mainRecoveryRouteStateCount = 0;
    disposed = false;
    constructor(options = {}) {
        this.router = options.router ?? createBrowserCaptureRouter();
        this.ownsRouter = options.disposeRouter ?? !options.router;
        this.worker = new DecodeWorkerClient(options.workerFactory);
        this.useWorker = options.useWorker ?? typeof Worker !== "undefined";
        this.baseScenario = options.scenario;
        this.recovery = options.recovery ?? {};
    }
    async decode(frame, request) {
        if (this.disposed) {
            return { ok: false, error: sdkError("session_disposed", "Scanner decoder has been disposed."), frameId: frame.id, scenarioId: "scanner-disposed", attemptCount: 0, timing: { totalMs: 0 } };
        }
        const profile = getBuiltinScenario(request.profile);
        const source = this.baseScenario ? {
            ...profile,
            acceptedFormats: [...this.baseScenario.acceptedFormats],
            multiCode: { ...this.baseScenario.multiCode },
            validation: this.baseScenario.validation.map((entry) => ({ ...entry })),
            semanticParsers: [...this.baseScenario.semanticParsers],
            output: { ...this.baseScenario.output },
        } : profile;
        const rawTrackingMaxResults = request.maxResults ?? 32;
        const requestedTrackingMaxResults = request.mode === "tracking"
            ? Number.isFinite(rawTrackingMaxResults)
                ? Math.max(1, Math.min(32, Math.floor(rawTrackingMaxResults)))
                : 32
            : undefined;
        // A profile's attempt budget is also a hard upper bound on how many
        // results one decode can produce. Keep the Beta 1 profile budget intact;
        // uncovered-region and periodic full-frame passes can discover additional
        // tracks across subsequent frames without creating an invalid scenario.
        const trackingMaxResults = requestedTrackingMaxResults === undefined
            ? undefined
            : Math.min(requestedTrackingMaxResults, source.budgets.maxAttempts);
        const decodeSource = trackingMaxResults === undefined ? source : {
            ...source,
            localization: {
                ...source.localization,
                maxCandidates: Math.max(source.localization.maxCandidates, trackingMaxResults),
            },
            multiCode: {
                enabled: true,
                maxResults: trackingMaxResults,
                // Identity is assigned after decode by BarcodeTracker. Spatial
                // deduplication keeps equal-payload objects at distinct geometries.
                deduplication: "payload-format-spatial",
            },
            budgets: {
                ...source.budgets,
                maxCandidates: Math.max(source.budgets.maxCandidates, trackingMaxResults),
            },
        };
        const scenario = request.roi
            ? { ...decodeSource, input: { ...decodeSource.input, roi: { mode: "relative", x: request.roi.x, y: request.roi.y, width: request.roi.width, height: request.roi.height } } }
            : { ...decodeSource, input: { ...decodeSource.input, roi: { mode: "full-frame" } } };
        if (this.useWorker) {
            const started = Date.now();
            markDecodePath("worker");
            const workerOutcome = await this.worker.scan(frame, scenario, { signal: request.signal, generation: request.generation, preserveSourceForFallback: true, ...(this.workerRecovery(request) ? { recovery: this.workerRecovery(request) } : {}) });
            if (workerOutcome.ok || request.signal.aborted || !["worker_initialization_failure", "engine_execution_failure"].includes(workerOutcome.error.code))
                return workerOutcome;
            const elapsed = Math.max(Date.now() - started, workerOutcome.timing.totalMs);
            const remainingExecutionMs = Math.floor(scenario.budgets.maxExecutionMs - elapsed);
            const remainingAttempts = scenario.budgets.maxAttempts - workerOutcome.attemptCount;
            if (remainingExecutionMs <= 0 || remainingAttempts <= 0)
                return workerOutcome;
            markDecodePath("main-thread");
            const fallbackScenario = { ...scenario, multiCode: { ...scenario.multiCode, maxResults: Math.min(scenario.multiCode.maxResults, remainingAttempts) }, budgets: { ...scenario.budgets, maxAttempts: remainingAttempts, maxExecutionMs: remainingExecutionMs } };
            const fallback = await this.decodeOnMain(frame, fallbackScenario, request);
            return { ...fallback, attemptCount: workerOutcome.attemptCount + fallback.attemptCount, timing: { ...fallback.timing, totalMs: Math.max(Date.now() - started, elapsed + fallback.timing.totalMs), ...(workerOutcome.timing.workerSetupMs === undefined ? {} : { workerSetupMs: workerOutcome.timing.workerSetupMs }), ...(workerOutcome.timing.workerTransferMs === undefined ? {} : { workerTransferMs: workerOutcome.timing.workerTransferMs }) } };
        }
        markDecodePath("main-thread");
        return this.decodeOnMain(frame, scenario, request);
    }
    workerRecovery(request) {
        if (this.recovery === false)
            return undefined;
        return {
            profile: this.recovery.profile ?? request.profile,
            sourceMode: "camera",
            ...(this.recovery.budget ? { budget: this.recovery.budget } : {}),
            dpmExperimental: this.recovery.dpmExperimental === true,
            ...(this.recovery.excludedRoutes ? { excludedRoutes: [...this.recovery.excludedRoutes] } : {}),
        };
    }
    async decodeOnMain(frame, scenario, request) {
        const recovery = this.workerRecovery(request);
        if (!recovery)
            return this.router.scan(frame, { signal: request.signal, scenario });
        const result = await this.recoveryPipeline.run(frame, (candidate, recoveryRequest) => this.router.scan({ ...candidate, ownership: "borrowed", dispose: undefined }, { signal: recoveryRequest.signal, scenario: recoveryRequest.routeId === "general" ? scenario : createRecoveryProbeScenario(scenario, recoveryRequest.routeId) }), { profile: recovery.profile, sourceMode: recovery.sourceMode, ...(recovery.budget ? { budget: recovery.budget } : {}), signal: request.signal, dpmExperimental: recovery.dpmExperimental, excludedRoutes: recovery.excludedRoutes });
        this.mainRecoveryRunCount += 1;
        this.mainRecoveryTemporaryBytes = result.memory.currentBytes;
        this.mainRecoveryPeakTemporaryBytes = Math.max(this.mainRecoveryPeakTemporaryBytes, result.memory.peakBytes);
        this.mainRecoveryRouteStateCount = 0;
        return result.outcome;
    }
    cancel() { this.worker.cancel(); }
    async dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.worker.dispose();
        if (this.ownsRouter)
            await this.router.dispose();
    }
    getStatistics() {
        const worker = this.worker.getStatistics();
        const wasm = this.router.engines.get("zxing-cpp-wasm");
        const memory = wasm?.getMemoryObservation?.();
        return {
            ...worker,
            wasmInputAllocationBytes: (worker.wasmInputAllocationBytes ?? 0) + (memory?.inputAllocationBytes ?? 0),
            wasmActiveNativeResultCount: (worker.wasmActiveNativeResultCount ?? 0) + (memory?.activeNativeResultCount ?? 0),
            wasmCurrentLinearMemoryBytes: (worker.wasmCurrentLinearMemoryBytes ?? 0) + (memory?.currentLinearMemoryBytes ?? 0),
            wasmPeakLinearMemoryBytes: (worker.wasmPeakLinearMemoryBytes ?? 0) + (memory?.peakLinearMemoryBytes ?? 0),
            wasmReleasedNativeResultCount: (worker.wasmReleasedNativeResultCount ?? 0) + (memory?.releasedNativeResultCount ?? 0),
            recoveryRunCount: (worker.recoveryRunCount ?? 0) + this.mainRecoveryRunCount,
            recoveryTemporaryBytes: (worker.recoveryTemporaryBytes ?? 0) + this.mainRecoveryTemporaryBytes,
            recoveryPeakTemporaryBytes: Math.max(worker.recoveryPeakTemporaryBytes ?? 0, this.mainRecoveryPeakTemporaryBytes),
            recoveryRouteStateCount: (worker.recoveryRouteStateCount ?? 0) + this.mainRecoveryRouteStateCount,
        };
    }
}
const once = (fn) => {
    let called = false;
    return (() => { if (!called) {
        called = true;
        fn();
    } });
};
function geometryFor(result, frame) {
    const points = result.cornerPoints;
    if (!points?.length)
        return undefined;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.max(0, Math.min(...xs));
    const y = Math.max(0, Math.min(...ys));
    const right = Math.min(frame.width, Math.max(...xs));
    const bottom = Math.min(frame.height, Math.max(...ys));
    if (right <= x || bottom <= y)
        return undefined;
    return { cornerPoints: points, boundingBox: { x, y, width: right - x, height: bottom - y }, frameWidth: frame.width, frameHeight: frame.height };
}
function isNoResult(outcome) {
    return !outcome.ok && ["no_symbol_found", "timeout", "cancelled", "unsupported_format"].includes(outcome.error.code);
}
const scannerSessionTerminalLifecycles = new WeakMap();
function terminalLifecycleFor(session) {
    const lifecycle = scannerSessionTerminalLifecycles.get(session);
    if (!lifecycle)
        throw new Error("Scanner session terminal lifecycle is unavailable.");
    return lifecycle;
}
function assertScannerSessionNotDisposed(session) {
    if (terminalLifecycleFor(session).disposed)
        throw new SdkException(sdkError("session_disposed", "Scanner session has been disposed."));
}
export class ScannerSession {
    state = "idle";
    source;
    decoder;
    ownsDecoder;
    quality;
    scheduler;
    escalation;
    candidates;
    repeats;
    roi;
    decodeMode;
    trackingRuntime;
    capabilityController;
    autoZoom;
    cameraRecovery;
    qualityProbeInterval;
    resultListeners = new Set();
    observationSetListeners = new Set();
    stateListeners = new Set();
    diagnosticListeners = new Set();
    generation = 0;
    lifecycleGeneration = 0;
    stopPromise = null;
    recoveryPromise = null;
    backgroundPaused = false;
    activeDecodeController = null;
    frameSequence = 0;
    eventSequence = 0;
    startedAt = 0;
    firstDecodeAt;
    firstConfirmedAt;
    decodeLatencies = [];
    peakControlledMemory = 0;
    currentWorkerMemory = 0;
    counters = {
        capturedFrames: 0, admittedFrames: 0, droppedFrames: 0, qualityRejectedFrames: 0, periodicProbeFrames: 0,
        fastAttempts: 0, balancedAttempts: 0, robustAttempts: 0, decodeSuccesses: 0, confirmedEvents: 0,
        emittedEvents: 0, suppressedRepeats: 0, staleResultsDiscarded: 0, staleEvents: 0, lostEvents: 0,
        cameraTrackEndings: 0, cameraGenerationInvalidations: 0,
    };
    constructor(options) {
        scannerSessionTerminalLifecycles.set(this, { disposed: false, disposePromise: null });
        this.source = options.source;
        this.decoder = options.decoder ?? new BrowserScannerFrameDecoder(options.decoderOptions);
        this.ownsDecoder = !options.decoder;
        this.quality = new FrameQualityAnalyzer(options.quality);
        this.escalation = new BoundedDecodeEscalation(options.escalation);
        this.candidates = new TemporalCandidateStore(options.confirmation);
        this.repeats = new RepeatSuppressor(options.repeatPolicy ?? { mode: "cooldown", cooldownMs: 1_500 });
        this.roi = new TemporalROI(options.roi);
        this.decodeMode = options.decodeMode ?? "single";
        this.trackingRuntime = this.decodeMode === "tracking"
            ? new ScannerTrackingRuntime(options.tracking)
            : undefined;
        this.autoZoom = options.autoZoom ?? { enabled: true };
        this.cameraRecovery = new CameraRecoveryController(options.cameraRecovery);
        const trackSource = options.source;
        this.capabilityController = options.capabilityController ?? (typeof trackSource.currentTrack === "function" ? new CameraCapabilityController(() => trackSource.currentTrack?.(), this.autoZoom) : undefined);
        this.qualityProbeInterval = Math.max(1, Math.floor(options.qualityProbeInterval ?? 10));
        this.scheduler = new FrameScheduler((frame) => this.processFrame(frame), {
            initialDecodeFps: 10, minimumDecodeFps: 5, maximumDecodeFps: 15, ...options.scheduler,
            onAdmitted: () => { this.counters.admittedFrames += 1; },
            onDropped: () => { this.counters.droppedFrames += 1; },
        });
    }
    getState() { return this.state; }
    async start() {
        assertScannerSessionNotDisposed(this);
        if (this.state === "scanning" || this.state === "starting")
            return;
        if (this.state === "stopping")
            throw new Error("Scanner session is stopping.");
        if (this.state === "failed" || this.state === "stopped")
            this.reset();
        this.setState("starting");
        const lifecycleGeneration = ++this.lifecycleGeneration;
        this.generation += 1;
        this.startedAt = Date.now();
        this.quality.reset();
        this.escalation.reset();
        this.scheduler.reset();
        this.trackingRuntime?.reset();
        this.scheduler.start();
        try {
            await this.source.start((frame) => this.acceptFrame(frame, lifecycleGeneration), (error) => this.handleSourceError(error, lifecycleGeneration), () => this.handleSourceEnded(lifecycleGeneration), (event) => this.handleCameraLifecycle(event, lifecycleGeneration));
            if (lifecycleGeneration === this.lifecycleGeneration && this.getState() === "starting")
                this.setState("scanning");
        }
        catch (error) {
            if (lifecycleGeneration !== this.lifecycleGeneration || this.getState() !== "starting")
                return;
            this.setState("failed");
            const typed = cameraError(error);
            this.emitDiagnostic({ type: "error", timestamp: Date.now(), error: typed });
            throw new SdkException(typed);
        }
    }
    pause() {
        if (this.state !== "scanning")
            return;
        this.source.pause?.();
        this.scheduler.pause();
        this.activeDecodeController?.abort();
        this.decoder.cancel();
        this.generation += 1;
        this.setState("paused");
    }
    resume() {
        if (this.state !== "paused")
            return;
        this.generation += 1;
        this.source.resume?.();
        this.scheduler.resume();
        this.setState("scanning");
    }
    async switchSource(source, capabilityController) {
        assertScannerSessionNotDisposed(this);
        const restart = this.state === "scanning" || this.state === "paused" || this.state === "starting";
        await this.stop();
        // stop() drains the active scheduler task. A decoder may complete after
        // generation invalidation and increment stale counters while that drain is
        // in progress, so take the cumulative snapshot only after it has settled.
        const switchInvalidations = this.counters.cameraGenerationInvalidations + 1;
        const staleResultsDiscarded = this.counters.staleResultsDiscarded;
        const staleEvents = this.counters.staleEvents;
        this.source = source;
        const trackSource = source;
        this.capabilityController = capabilityController ?? (typeof trackSource.currentTrack === "function" ? new CameraCapabilityController(() => trackSource.currentTrack?.(), this.autoZoom) : undefined);
        this.reset();
        // reset() intentionally starts fresh run-level metrics. Preserve the
        // cumulative switch/stale counts so every source generation change and
        // rejected late result remains auditable across rear/front/rear switches.
        this.counters.cameraGenerationInvalidations = switchInvalidations;
        this.counters.staleResultsDiscarded = staleResultsDiscarded;
        this.counters.staleEvents = staleEvents;
        if (restart)
            await this.start();
    }
    async stop() {
        if (["idle", "stopped"].includes(this.state))
            return;
        if (this.state === "stopping") {
            await this.stopPromise;
            return;
        }
        this.lifecycleGeneration += 1;
        this.generation += 1;
        this.activeDecodeController?.abort();
        this.decoder.cancel();
        this.recoveryPromise = null;
        this.backgroundPaused = false;
        const stopping = Promise.resolve().then(async () => {
            try {
                await this.source.stop();
            }
            finally {
                await this.scheduler.stop();
                this.candidates.reset();
                this.repeats.reset();
                this.roi.reset();
                this.trackingRuntime?.reset();
                this.setState("stopped");
                this.emitDiagnostic({ type: "scheduler", timestamp: Date.now(), detail: "session stopped; pending frames and active decode are zero" });
            }
        });
        this.stopPromise = stopping;
        this.setState("stopping");
        try {
            await stopping;
        }
        finally {
            if (this.stopPromise === stopping)
                this.stopPromise = null;
        }
    }
    reset() {
        assertScannerSessionNotDisposed(this);
        if (this.state === "scanning" || this.state === "starting" || this.state === "paused")
            throw new Error("Stop the scanner session before reset().");
        this.lifecycleGeneration += 1;
        this.generation += 1;
        this.candidates.reset();
        this.repeats.reset();
        this.roi.reset();
        this.trackingRuntime?.reset();
        this.escalation.reset();
        this.quality.reset();
        this.scheduler.reset();
        this.cameraRecovery.reset();
        this.backgroundPaused = false;
        this.decodeLatencies = [];
        this.firstDecodeAt = undefined;
        this.firstConfirmedAt = undefined;
        this.startedAt = 0;
        this.peakControlledMemory = 0;
        this.currentWorkerMemory = 0;
        this.counters = { capturedFrames: 0, admittedFrames: 0, droppedFrames: 0, qualityRejectedFrames: 0, periodicProbeFrames: 0, fastAttempts: 0, balancedAttempts: 0, robustAttempts: 0, decodeSuccesses: 0, confirmedEvents: 0, emittedEvents: 0, suppressedRepeats: 0, staleResultsDiscarded: 0, staleEvents: 0, lostEvents: 0, cameraTrackEndings: 0, cameraGenerationInvalidations: 0 };
        this.setState("idle");
    }
    async dispose() {
        const lifecycle = terminalLifecycleFor(this);
        if (lifecycle.disposePromise) {
            await lifecycle.disposePromise;
            return;
        }
        lifecycle.disposed = true;
        const operation = (async () => {
            try {
                await this.stop();
            }
            finally {
                try {
                    if (this.ownsDecoder)
                        await this.decoder.dispose();
                }
                finally {
                    this.resultListeners.clear();
                    this.observationSetListeners.clear();
                    this.stateListeners.clear();
                    this.diagnosticListeners.clear();
                }
            }
        })();
        lifecycle.disposePromise = operation;
        await operation;
    }
    getStatistics() {
        const scheduler = this.scheduler.getStatistics();
        const decoder = this.decoder.getStatistics?.();
        const now = Date.now();
        const elapsed = Math.max(1, now - (this.startedAt || now));
        const sorted = [...this.decodeLatencies].sort((a, b) => a - b);
        const p50 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1)] : 0;
        const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
        const currentWorkerMemory = decoder?.wasmCurrentLinearMemoryBytes ?? this.currentWorkerMemory;
        const wasmInputAllocationBytes = decoder?.wasmInputAllocationBytes ?? 0;
        const recoveryTemporaryBytes = decoder?.recoveryTemporaryBytes ?? 0;
        const recoveryRouteStateCount = decoder?.recoveryRouteStateCount ?? 0;
        const decoderControlledMemory = Math.max(currentWorkerMemory, wasmInputAllocationBytes, recoveryTemporaryBytes);
        const temporalControlledState = this.candidates.size + this.repeats.size + Number(this.roi.active) + (this.trackingRuntime?.controlledSize ?? 0);
        return {
            ...this.counters,
            cameraRecovery: this.cameraRecovery.getStatistics(),
            averageDecodeMs: this.decodeLatencies.length ? this.decodeLatencies.reduce((a, b) => a + b, 0) / this.decodeLatencies.length : 0,
            p50DecodeMs: p50,
            p95DecodeMs: p95,
            effectiveDecodeFps: scheduler.effectiveDecodeFps || (this.counters.admittedFrames * 1_000 / elapsed),
            frameDropRate: this.counters.capturedFrames ? this.counters.droppedFrames / this.counters.capturedFrames : 0,
            ...(this.firstDecodeAt === undefined ? {} : { timeToFirstDecodeMs: this.firstDecodeAt - this.startedAt }),
            ...(this.firstConfirmedAt === undefined ? {} : { timeToFirstConfirmedScanMs: this.firstConfirmedAt - this.startedAt }),
            currentWorkerMemory,
            peakControlledMemory: Math.max(this.peakControlledMemory, decoder?.wasmPeakLinearMemoryBytes ?? 0, decoder?.recoveryPeakTemporaryBytes ?? 0),
            activeDecodeCount: scheduler.active,
            pendingFrameCount: scheduler.pending,
            peakPendingFrameCount: scheduler.peakPending,
            workerCreatedCount: decoder?.workerCreatedCount ?? 0,
            workerTerminatedCount: decoder?.workerTerminatedCount ?? 0,
            activeTaskCount: decoder?.activeTaskCount ?? 0,
            peakActiveTaskCount: decoder?.peakActiveTaskCount ?? 0,
            workerWasmDecodeCount: decoder?.workerWasmDecodeCount ?? 0,
            wasmInputAllocationBytes,
            wasmActiveNativeResultCount: decoder?.wasmActiveNativeResultCount ?? 0,
            wasmPeakLinearMemoryBytes: decoder?.wasmPeakLinearMemoryBytes ?? 0,
            wasmReleasedNativeResultCount: decoder?.wasmReleasedNativeResultCount ?? 0,
            recoveryRunCount: decoder?.recoveryRunCount ?? 0,
            recoveryTemporaryBytes,
            recoveryPeakTemporaryBytes: decoder?.recoveryPeakTemporaryBytes ?? 0,
            recoveryRouteStateCount,
            finalControlledMemory: scheduler.active + scheduler.pending + decoderControlledMemory + temporalControlledState + recoveryRouteStateCount,
        };
    }
    onResult(listener) { this.resultListeners.add(listener); return () => this.resultListeners.delete(listener); }
    onObservations(listener) { this.observationSetListeners.add(listener); return () => this.observationSetListeners.delete(listener); }
    onStateChange(listener) { this.stateListeners.add(listener); return () => this.stateListeners.delete(listener); }
    onDiagnostics(listener) { this.diagnosticListeners.add(listener); return () => this.diagnosticListeners.delete(listener); }
    getTracks() { return this.trackingRuntime?.getTracks() ?? []; }
    getTrackingStatistics() { return this.trackingRuntime?.getStatistics(); }
    getDeviceDiagnostics() { return this.source.getDeviceDiagnostics?.(); }
    getCameraCapabilities() { return this.capabilityController?.getCapabilities() ?? { torch: false, focusMode: false }; }
    setTorch(enabled) { return this.capabilityController?.setTorch(enabled) ?? Promise.resolve({ ok: false, error: sdkError("camera_capability_unsupported", "Torch is not available for this scanner source.") }); }
    setZoom(value, manual = true) { return this.capabilityController?.setZoom(value, manual) ?? Promise.resolve({ ok: false, error: sdkError("camera_capability_unsupported", "Zoom is not available for this scanner source.") }); }
    requestFocus() { return this.capabilityController?.requestFocus() ?? Promise.resolve({ ok: false, error: sdkError("camera_capability_unsupported", "Focus is not available for this scanner source.") }); }
    async acceptFrame(frame, lifecycleGeneration) {
        if (lifecycleGeneration !== this.lifecycleGeneration) {
            releaseFrame(frame);
            return;
        }
        this.counters.capturedFrames += 1;
        const release = once(() => { if (frame.ownership !== "borrowed")
            frame.dispose?.(); });
        const owned = { ...frame, dispose: release };
        this.scheduler.submit(owned);
        await this.scheduler.waitForIdle();
    }
    async processFrame(frame) {
        const frameId = ++this.frameSequence;
        const now = frame.timestampMs || Date.now();
        const quality = this.quality.analyze(frame);
        this.emitDiagnostic({ type: "frame-quality", timestamp: now, frameId, quality });
        this.emitQualityHint(quality, frameId, now);
        const periodicProbe = this.counters.admittedFrames % this.qualityProbeInterval === 0;
        if (!quality.usable && !periodicProbe) {
            this.counters.qualityRejectedFrames += 1;
            this.roi.miss();
            this.emitObservationSet({ frameId, timestamp: now, frameWidth: frame.width, frameHeight: frame.height, generation: this.generation, quality, decodeMode: this.decodeMode, observations: [] });
            this.emitLost(now, frameId);
            releaseFrame(frame);
            return { quality, success: false };
        }
        if (periodicProbe)
            this.counters.periodicProbeFrames += 1;
        const trackingSelection = this.trackingRuntime?.selectDecode(frameId, frame);
        const roi = trackingSelection ? trackingSelection.roi : this.roi.hint(frame, now);
        const roiPhase = trackingSelection?.phase ?? (roi ? "temporal" : "full-frame");
        const profile = this.trackingRuntime?.profile
            ?? this.escalation.select(quality, trackingSelection ? trackingSelection.plan.trackedROIs.length > 0 : this.roi.active, now);
        this.counters[`${profile}Attempts`] += 1;
        const generation = this.generation;
        const controller = new AbortController();
        this.activeDecodeController = controller;
        const started = Date.now();
        let outcome;
        try {
            outcome = await this.decoder.decode(frame, {
                profile,
                quality,
                mode: this.decodeMode,
                ...(this.trackingRuntime ? { maxResults: this.trackingRuntime.maxResults } : {}),
                roiPhase,
                ...(roi ? { roi } : {}),
                signal: controller.signal,
                generation,
            });
        }
        catch (error) {
            outcome = { ok: false, error: sdkError("engine_execution_failure", error instanceof Error ? error.message : String(error), undefined, error), frameId: frame.id, scenarioId: profile, attemptCount: 0, timing: { totalMs: Date.now() - started } };
        }
        finally {
            if (this.activeDecodeController === controller)
                this.activeDecodeController = null;
        }
        const elapsed = Math.max(0, Date.now() - started);
        this.decodeLatencies.push(elapsed);
        if (this.decodeLatencies.length > 256)
            this.decodeLatencies.shift();
        this.currentWorkerMemory = outcome.timing.controlledMemory?.currentControlledBytes ?? 0;
        this.peakControlledMemory = Math.max(this.peakControlledMemory, outcome.timing.controlledMemory?.peakControlledBytes ?? 0);
        try {
            if (generation !== this.generation) {
                this.counters.staleResultsDiscarded += 1;
                return { quality, decodeMs: elapsed, success: false };
            }
            if (outcome.ok) {
                const recoveryDiagnostic = ScannerDiagnostics.fromResult(outcome.primary);
                if (recoveryDiagnostic)
                    this.emitDiagnostic({ type: "recovery", timestamp: now, frameId, profile, decodeMs: elapsed, recovery: recoveryDiagnostic, detail: ScannerDiagnostics.explain(recoveryDiagnostic).join(" ") });
                const observations = outcome.results.map((result) => {
                    const geometry = geometryFor(result, frame);
                    return { barcode: toDecodedBarcode(result), frameId, timestamp: now, ...(geometry ? { geometry } : {}) };
                });
                this.emitObservationSet({ frameId, timestamp: now, frameWidth: frame.width, frameHeight: frame.height, generation, quality, decodeMode: this.decodeMode, roiPhase, profile, decodeMs: elapsed, observations });
                this.emitLost(now, frameId);
                this.counters.decodeSuccesses += outcome.results.length;
                if (this.firstDecodeAt === undefined)
                    this.firstDecodeAt = Date.now();
                this.escalation.observe(true, now);
                if (!this.trackingRuntime)
                    this.roi.update(outcome.primary, frame, now);
                for (const result of outcome.results)
                    this.observeResult(result, frame, quality, now, frameId, generation);
            }
            else {
                this.emitObservationSet({ frameId, timestamp: now, frameWidth: frame.width, frameHeight: frame.height, generation, quality, decodeMode: this.decodeMode, roiPhase, profile, decodeMs: elapsed, observations: [] });
                this.escalation.observe(false, now);
                if (!this.trackingRuntime)
                    this.roi.miss();
                if (!isNoResult(outcome))
                    this.emitDiagnostic({ type: "decode", timestamp: now, frameId, profile, decodeMs: elapsed, error: outcome.error });
                this.emitLost(now, frameId);
            }
            return { quality, decodeMs: elapsed, success: outcome.ok };
        }
        finally {
            releaseFrame(frame);
        }
    }
    observeResult(result, frame, quality, now, frameId, generation) {
        if (!this.canPublishGeneration(generation)) {
            this.counters.staleEvents += 1;
            return;
        }
        const barcode = toDecodedBarcode(result);
        const geometry = geometryFor(result, frame);
        const detected = this.event("detected", barcode, frameId, now, 1, geometry);
        this.emitDiagnostic({ type: "event", timestamp: now, frameId, event: detected });
        const observation = this.candidates.observe(barcode, geometry, quality, now);
        if (!observation.confirmed)
            return;
        // Capability control follows confirmed camera observations, even when the
        // public repeat policy suppresses a duplicate event. That makes auto-zoom
        // cooldown behavior observable without publishing duplicate scan results.
        if (this.capabilityController && this.autoZoom && geometry) {
            const beforeZoom = this.capabilityController.getCapabilities().zoom?.current;
            const autoZoomGeneration = this.generation;
            void this.capabilityController.considerAutoZoom(geometry, frame, now).then((result) => {
                if (!result || autoZoomGeneration !== this.generation || !this.canPublishGeneration(autoZoomGeneration))
                    return;
                const afterZoom = this.capabilityController?.getCapabilities().zoom?.current;
                this.emitDiagnostic({
                    type: "camera",
                    timestamp: Date.now(),
                    frameId,
                    detail: `auto-zoom-result:${JSON.stringify({ result, triggeredAt: now, ...(beforeZoom === undefined ? {} : { beforeZoom }), ...(afterZoom === undefined ? {} : { afterZoom }) })}`,
                });
            }).catch((error) => this.emitDiagnostic({ type: "error", timestamp: Date.now(), frameId, error: cameraError(error, "Auto-zoom observation failed.") }));
        }
        if (observation.newlyConfirmed) {
            this.counters.confirmedEvents += 1;
            if (this.firstConfirmedAt === undefined)
                this.firstConfirmedAt = Date.now();
            const confirmed = this.event("confirmed", barcode, frameId, now, observation.candidate.observationCount, geometry);
            this.emitDiagnostic({ type: "event", timestamp: now, frameId, event: confirmed });
        }
        const decision = this.repeats.evaluate(barcode, geometry, now);
        if (!decision.emit) {
            this.counters.suppressedRepeats += 1;
            const suppressed = this.event("suppressed", barcode, frameId, now, observation.candidate.observationCount, geometry, decision.physicalInstanceId, decision.reason);
            this.emitDiagnostic({ type: "event", timestamp: now, frameId, event: suppressed });
            return;
        }
        const emitted = this.event("emitted", barcode, frameId, now, observation.candidate.observationCount, geometry, decision.physicalInstanceId);
        if (!this.canPublishGeneration(generation)) {
            this.counters.staleEvents += 1;
            return;
        }
        this.counters.emittedEvents += 1;
        for (const listener of this.resultListeners) {
            try {
                listener(emitted);
            }
            catch (error) {
                this.emitDiagnostic({ type: "error", timestamp: now, frameId, error: sdkError("internal_invariant_failure", error instanceof Error ? error.message : String(error), undefined, error) });
            }
        }
        this.emitDiagnostic({ type: "event", timestamp: now, frameId, event: emitted });
    }
    emitLost(now, frameId) {
        for (const lost of this.candidates.lost(now)) {
            this.counters.lostEvents += 1;
            const event = this.event("lost", lost.barcode, frameId, now, lost.candidate.observationCount, lost.candidate.latestGeometry);
            this.emitDiagnostic({ type: "event", timestamp: now, frameId, event });
        }
    }
    event(type, barcode, frameId, timestamp, observationCount, geometry, physicalInstanceId, suppressionReason) {
        return { id: `scan-event-${++this.eventSequence}`, type, barcode, frameId, timestamp, observationCount, ...(geometry ? { geometry } : {}), ...(physicalInstanceId ? { physicalInstanceId } : {}), ...(suppressionReason ? { suppressionReason } : {}) };
    }
    canPublishGeneration(generation) { return !terminalLifecycleFor(this).disposed && generation === this.generation && (this.state === "starting" || this.state === "scanning"); }
    emitObservationSet(set) {
        if (!this.canPublishGeneration(set.generation))
            return;
        this.trackingRuntime?.observe(set);
        for (const listener of this.observationSetListeners) {
            try {
                listener(set);
            }
            catch (error) {
                this.emitDiagnostic({ type: "error", timestamp: set.timestamp, frameId: set.frameId, error: sdkError("internal_invariant_failure", error instanceof Error ? error.message : String(error), undefined, error) });
            }
        }
    }
    emitQualityHint(quality, frameId, timestamp) {
        const hint = quality.underexposed ? { type: "increase_light", confidence: 1 - quality.brightness } : quality.overexposed || quality.glareDominated ? { type: "reduce_glare", confidence: Math.max(quality.glareRatio, quality.brightness) } : quality.blurred ? { type: "hold_steady", confidence: 1 - quality.blurScore } : { type: "searching", confidence: quality.usable ? 0.45 : 0.8 };
        this.emitDiagnostic({ type: "hint", timestamp, frameId, hint });
    }
    handleSourceEnded(lifecycleGeneration) {
        queueMicrotask(() => {
            if (lifecycleGeneration !== this.lifecycleGeneration || !["starting", "scanning", "paused"].includes(this.state))
                return;
            if (this.state === "starting" || !this.source.restart) {
                void this.stop();
                return;
            }
            this.counters.cameraTrackEndings += 1;
            this.emitDiagnostic({ type: "error", timestamp: Date.now(), error: sdkError("camera_track_ended", "The active camera track ended.") });
            void this.recoverCamera("track-ended", lifecycleGeneration);
        });
    }
    handleSourceError(error, lifecycleGeneration) {
        if (lifecycleGeneration !== this.lifecycleGeneration || this.state === "stopping" || this.state === "stopped")
            return;
        const typed = cameraError(error);
        this.emitDiagnostic({ type: "error", timestamp: Date.now(), error: typed });
        if (["camera_busy", "camera_constraint_failed", "camera_track_ended", "source_disconnected"].includes(typed.code)) {
            void this.recoverCamera(typed.code, lifecycleGeneration);
            return;
        }
        this.failCamera(typed, lifecycleGeneration);
    }
    handleCameraLifecycle(event, lifecycleGeneration) {
        if (lifecycleGeneration !== this.lifecycleGeneration || ["stopping", "stopped", "failed"].includes(this.state))
            return;
        this.emitDiagnostic({ type: "camera", timestamp: event.timestamp, cameraLifecycle: event, deviceDiagnostics: this.source.getDeviceDiagnostics?.(), detail: event.detail });
        if (event.reason === "background-suspended") {
            this.emitDiagnostic({ type: "error", timestamp: event.timestamp, error: sdkError("browser_background_suspended", "Browser visibility changed to hidden; camera publication is suspended until foreground recovery.") });
            if (this.state === "scanning" || this.state === "starting") {
                this.invalidateCameraGeneration(event.reason);
                this.source.pause?.();
                this.scheduler.pause();
                this.backgroundPaused = true;
                this.setState("paused");
            }
            return;
        }
        if (event.reason === "foreground-resumed") {
            if (!this.backgroundPaused)
                return;
            this.invalidateCameraGeneration(event.reason);
            this.backgroundPaused = false;
            const track = this.source.currentTrack?.();
            if (!track || track.readyState === "ended") {
                void this.recoverCamera("foreground-track-not-live", lifecycleGeneration);
                return;
            }
            this.source.resume?.();
            this.scheduler.resume();
            this.setState("scanning");
            return;
        }
        this.invalidateCameraGeneration(event.reason);
    }
    invalidateCameraGeneration(reason) {
        this.generation += 1;
        this.counters.cameraGenerationInvalidations += 1;
        this.activeDecodeController?.abort();
        this.decoder.cancel();
        this.candidates.reset();
        this.repeats.reset();
        this.roi.reset();
        this.trackingRuntime?.reset();
        this.escalation.reset();
        this.quality.reset();
        this.emitDiagnostic({ type: "camera", timestamp: Date.now(), detail: `scanner generation invalidated: ${reason}` });
    }
    async recoverCamera(reason, lifecycleGeneration) {
        if (this.recoveryPromise)
            return this.recoveryPromise;
        const recovery = (async () => {
            const decision = this.cameraRecovery.next(reason);
            this.invalidateCameraGeneration(`recovery:${reason}`);
            this.source.pause?.();
            this.scheduler.pause();
            this.emitDiagnostic({ type: "camera", timestamp: Date.now(), detail: decision.retry ? `camera recovery ${decision.attempt} scheduled after ${decision.delayMs}ms` : "camera recovery budget exhausted" });
            if (!decision.retry || !this.source.restart) {
                this.cameraRecovery.markFailed();
                this.failCamera(sdkError("camera_recovery_failed", "Camera recovery budget was exhausted or the source cannot restart.", { reason, attempts: decision.attempt }), lifecycleGeneration);
                return;
            }
            await this.cameraRecovery.wait(decision);
            if (lifecycleGeneration !== this.lifecycleGeneration || ["stopping", "stopped"].includes(this.state))
                return;
            try {
                await this.source.restart();
                if (lifecycleGeneration !== this.lifecycleGeneration || ["stopping", "stopped"].includes(this.state))
                    return;
                this.cameraRecovery.markRestarted();
                this.backgroundPaused = false;
                this.scheduler.resume();
                this.setState("scanning");
                this.emitDiagnostic({ type: "camera", timestamp: Date.now(), deviceDiagnostics: this.source.getDeviceDiagnostics?.(), detail: `camera recovery ${decision.attempt} completed` });
            }
            catch (error) {
                this.cameraRecovery.markFailed();
                const typed = cameraError(error);
                this.emitDiagnostic({ type: "error", timestamp: Date.now(), error: typed });
                if (typed.retryable) {
                    this.recoveryPromise = null;
                    await this.recoverCamera(reason, lifecycleGeneration);
                }
                else
                    this.failCamera(typed, lifecycleGeneration);
            }
        })();
        this.recoveryPromise = recovery;
        try {
            await recovery;
        }
        finally {
            if (this.recoveryPromise === recovery)
                this.recoveryPromise = null;
        }
    }
    failCamera(error, lifecycleGeneration) {
        if (lifecycleGeneration !== this.lifecycleGeneration)
            return;
        this.lifecycleGeneration += 1;
        this.generation += 1;
        this.backgroundPaused = false;
        this.setState("failed");
        this.activeDecodeController?.abort();
        this.decoder.cancel();
        void this.scheduler.stop();
        void this.source.stop();
        this.emitDiagnostic({ type: "error", timestamp: Date.now(), error });
    }
    setState(state) { if (this.state === state)
        return; this.state = state; if (terminalLifecycleFor(this).disposed)
        return; for (const listener of this.stateListeners) {
        try {
            listener(state);
        }
        catch { /* listener failures do not own session state */ }
    } }
    emitDiagnostic(diagnostic) { if (terminalLifecycleFor(this).disposed)
        return; for (const listener of this.diagnosticListeners) {
        try {
            listener(diagnostic);
        }
        catch { /* diagnostics are observational */ }
    } }
}
function releaseFrame(frame) { frame.dispose?.(); }
//# sourceMappingURL=scanner-session.js.map