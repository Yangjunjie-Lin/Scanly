import {
  CaptureRouter,
  IndustrialRecoveryPipeline,
  ScannerDiagnostics,
  createRecoveryProbeScenario,
  sdkError,
  toDecodedBarcode,
  type DecodedBarcode,
  type NormalizedFrame,
  type RecoveryBudget,
  type RecoveryProfile,
  type RecoveryRouteId,
  type ScanOutcome,
  type ScanResult,
} from "@scanly/core";
import { getBuiltinScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { createBrowserCaptureRouter } from "../runtime.js";
import { DecodeWorkerClient, markDecodePath, type DecodeWorkerFactory } from "../worker/worker-client.js";
import {
  ScannerTrackingRuntime,
  type ScannerTrackingRuntimeOptions,
} from "../tracking/scanner-tracking-runtime.js";
import type { BarcodeTrack, TrackingStatistics } from "../tracking/types.js";
import { CameraCapabilityController } from "./camera-capabilities.js";
import { BoundedDecodeEscalation } from "./decode-escalation.js";
import { FrameQualityAnalyzer, type FrameQualityAnalyzerOptions } from "./frame-quality.js";
import { FrameScheduler, type FrameProcessFeedback, type FrameSchedulerOptions } from "./frame-scheduler.js";
import { RepeatSuppressor } from "./repeat-suppressor.js";
import { TemporalCandidateStore, type TemporalCandidateStoreOptions } from "./temporal-confirmation.js";
import { TemporalROI, type TemporalROIOptions } from "./temporal-roi.js";
import type {
  AutoZoomOptions,
  BarcodeObservationSet,
  BarcodeObservationSetListener,
  BarcodeGeometry,
  CameraCapabilities,
  CameraFrameSource,
  CapabilityResult,
  DecodeProfile,
  FrameQuality,
  RepeatPolicy,
  ScanEvent,
  ScannerDecodeRequest,
  ScannerDecodeMode,
  ScannerDiagnostic,
  ScannerDiagnosticListener,
  ScannerFrameDecoder,
  ScannerHint,
  ScannerSessionStatistics,
  ScannerSessionState,
  ScannerStateListener,
  ScanResultListener,
  Unsubscribe,
} from "./types.js";

export interface BrowserScannerFrameDecoderOptions {
  router?: CaptureRouter;
  workerFactory?: DecodeWorkerFactory;
  useWorker?: boolean;
  disposeRouter?: boolean;
  scenario?: ScenarioDefinition;
  /** Camera defaults to diagnosis-driven recovery; DPM remains explicitly off. */
  recovery?: false | BrowserIndustrialRecoveryOptions;
}

export interface BrowserIndustrialRecoveryOptions {
  profile?: RecoveryProfile;
  budget?: RecoveryBudget;
  dpmExperimental?: boolean;
  excludedRoutes?: readonly RecoveryRouteId[];
}

/** Default decoder composition: persistent Worker with an explicit main-thread fallback. */
export class BrowserScannerFrameDecoder implements ScannerFrameDecoder {
  private readonly router: CaptureRouter;
  private readonly ownsRouter: boolean;
  private readonly worker: DecodeWorkerClient;
  private readonly useWorker: boolean;
  private readonly baseScenario?: ScenarioDefinition;
  private readonly recovery: false | BrowserIndustrialRecoveryOptions;
  private readonly recoveryPipeline = new IndustrialRecoveryPipeline();
  private mainRecoveryRunCount = 0;
  private mainRecoveryTemporaryBytes = 0;
  private mainRecoveryPeakTemporaryBytes = 0;
  private mainRecoveryRouteStateCount = 0;
  private disposed = false;

  constructor(options: BrowserScannerFrameDecoderOptions = {}) {
    this.router = options.router ?? createBrowserCaptureRouter();
    this.ownsRouter = options.disposeRouter ?? !options.router;
    this.worker = new DecodeWorkerClient(options.workerFactory);
    this.useWorker = options.useWorker ?? typeof Worker !== "undefined";
    this.baseScenario = options.scenario;
    this.recovery = options.recovery ?? {};
  }

  async decode(frame: NormalizedFrame, request: ScannerDecodeRequest): Promise<ScanOutcome> {
    if (this.disposed) {
      return { ok: false, error: sdkError("session_disposed", "Scanner decoder has been disposed."), frameId: frame.id, scenarioId: "scanner-disposed", attemptCount: 0, timing: { totalMs: 0 } };
    }
    const profile = getBuiltinScenario(request.profile);
    const source: ScenarioDefinition = this.baseScenario ? {
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
    const decodeSource: ScenarioDefinition = trackingMaxResults === undefined ? source : {
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
    const scenario: ScenarioDefinition = request.roi
      ? { ...decodeSource, input: { ...decodeSource.input, roi: { mode: "relative", x: request.roi.x, y: request.roi.y, width: request.roi.width, height: request.roi.height } } }
      : { ...decodeSource, input: { ...decodeSource.input, roi: { mode: "full-frame" } } };
    if (this.useWorker) {
      const started = Date.now();
      markDecodePath("worker");
      const workerOutcome = await this.worker.scan(frame, scenario, { signal: request.signal, generation: request.generation, preserveSourceForFallback: true, ...(this.workerRecovery(request) ? { recovery: this.workerRecovery(request)! } : {}) });
      if (workerOutcome.ok || request.signal.aborted || !["worker_initialization_failure", "engine_execution_failure"].includes(workerOutcome.error.code)) return workerOutcome;
      const elapsed = Math.max(Date.now() - started, workerOutcome.timing.totalMs);
      const remainingExecutionMs = Math.floor(scenario.budgets.maxExecutionMs - elapsed);
      const remainingAttempts = scenario.budgets.maxAttempts - workerOutcome.attemptCount;
      if (remainingExecutionMs <= 0 || remainingAttempts <= 0) return workerOutcome;
      markDecodePath("main-thread");
      const fallbackScenario: ScenarioDefinition = { ...scenario, multiCode: { ...scenario.multiCode, maxResults: Math.min(scenario.multiCode.maxResults, remainingAttempts) }, budgets: { ...scenario.budgets, maxAttempts: remainingAttempts, maxExecutionMs: remainingExecutionMs } };
      const fallback = await this.decodeOnMain(frame, fallbackScenario, request);
      return { ...fallback, attemptCount: workerOutcome.attemptCount + fallback.attemptCount, timing: { ...fallback.timing, totalMs: Math.max(Date.now() - started, elapsed + fallback.timing.totalMs), ...(workerOutcome.timing.workerSetupMs === undefined ? {} : { workerSetupMs: workerOutcome.timing.workerSetupMs }), ...(workerOutcome.timing.workerTransferMs === undefined ? {} : { workerTransferMs: workerOutcome.timing.workerTransferMs }) } };
    }
    markDecodePath("main-thread");
    return this.decodeOnMain(frame, scenario, request);
  }

  private workerRecovery(request: ScannerDecodeRequest) {
    if (this.recovery === false) return undefined;
    return {
      profile: this.recovery.profile ?? request.profile,
      sourceMode: "camera" as const,
      ...(this.recovery.budget ? { budget: this.recovery.budget } : {}),
      dpmExperimental: this.recovery.dpmExperimental === true,
      ...(this.recovery.excludedRoutes ? { excludedRoutes: [...this.recovery.excludedRoutes] } : {}),
    };
  }

  private async decodeOnMain(frame: NormalizedFrame, scenario: ScenarioDefinition, request: ScannerDecodeRequest): Promise<ScanOutcome> {
    const recovery = this.workerRecovery(request);
    if (!recovery) return this.router.scan(frame, { signal: request.signal, scenario });
    const result = await this.recoveryPipeline.run(frame, (candidate, recoveryRequest) => this.router.scan(
      { ...candidate, ownership: "borrowed", dispose: undefined },
      { signal: recoveryRequest.signal, scenario: recoveryRequest.routeId === "general" ? scenario : createRecoveryProbeScenario(scenario, recoveryRequest.routeId) },
    ), { profile: recovery.profile, sourceMode: recovery.sourceMode, ...(recovery.budget ? { budget: recovery.budget } : {}), signal: request.signal, dpmExperimental: recovery.dpmExperimental, excludedRoutes: recovery.excludedRoutes });
    this.mainRecoveryRunCount += 1;
    this.mainRecoveryTemporaryBytes = result.memory.currentBytes;
    this.mainRecoveryPeakTemporaryBytes = Math.max(this.mainRecoveryPeakTemporaryBytes, result.memory.peakBytes);
    this.mainRecoveryRouteStateCount = 0;
    return result.outcome;
  }

  cancel(): void { this.worker.cancel(); }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.dispose();
    if (this.ownsRouter) await this.router.dispose();
  }
  getStatistics() {
    const worker = this.worker.getStatistics();
    const wasm = this.router.engines.get("zxing-cpp-wasm") as { getMemoryObservation?: () => { inputAllocationBytes: number; activeNativeResultCount: number; currentLinearMemoryBytes: number; peakLinearMemoryBytes: number; releasedNativeResultCount: number } } | undefined;
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

export interface ScannerSessionOptions {
  source: CameraFrameSource;
  decoder?: ScannerFrameDecoder;
  decoderOptions?: BrowserScannerFrameDecoderOptions;
  confirmation?: TemporalCandidateStoreOptions;
  repeatPolicy?: RepeatPolicy;
  quality?: FrameQualityAnalyzerOptions;
  qualityProbeInterval?: number;
  scheduler?: FrameSchedulerOptions;
  escalation?: ConstructorParameters<typeof BoundedDecodeEscalation>[0];
  roi?: TemporalROIOptions;
  capabilityController?: CameraCapabilityController;
  autoZoom?: AutoZoomOptions;
  /** Explicitly enables the bounded multi-code tracking decode path. */
  decodeMode?: ScannerDecodeMode;
  /** Tracker/ROI composition used only when decodeMode is "tracking". */
  tracking?: ScannerTrackingRuntimeOptions;
}

const once = <T extends () => void>(fn: T): T => {
  let called = false;
  return (() => { if (!called) { called = true; fn(); } }) as T;
};

function geometryFor(result: ScanResult, frame: NormalizedFrame): BarcodeGeometry | undefined {
  const points = result.cornerPoints;
  if (!points?.length) return undefined;
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  const x = Math.max(0, Math.min(...xs)); const y = Math.max(0, Math.min(...ys));
  const right = Math.min(frame.width, Math.max(...xs)); const bottom = Math.min(frame.height, Math.max(...ys));
  if (right <= x || bottom <= y) return undefined;
  return { cornerPoints: points, boundingBox: { x, y, width: right - x, height: bottom - y }, frameWidth: frame.width, frameHeight: frame.height };
}

function isNoResult(outcome: ScanOutcome): boolean {
  return !outcome.ok && ["no_symbol_found", "timeout", "cancelled", "unsupported_format"].includes(outcome.error.code);
}

export class ScannerSession {
  private state: ScannerSessionState = "idle";
  private source: CameraFrameSource;
  private readonly decoder: ScannerFrameDecoder;
  private readonly ownsDecoder: boolean;
  private readonly quality: FrameQualityAnalyzer;
  private readonly scheduler: FrameScheduler;
  private readonly escalation: BoundedDecodeEscalation;
  private readonly candidates: TemporalCandidateStore;
  private readonly repeats: RepeatSuppressor;
  private readonly roi: TemporalROI;
  private readonly decodeMode: ScannerDecodeMode;
  private readonly trackingRuntime?: ScannerTrackingRuntime;
  private capabilityController?: CameraCapabilityController;
  private readonly autoZoom?: AutoZoomOptions;
  private readonly qualityProbeInterval: number;
  private readonly resultListeners = new Set<ScanResultListener>();
  private readonly observationSetListeners = new Set<BarcodeObservationSetListener>();
  private readonly stateListeners = new Set<ScannerStateListener>();
  private readonly diagnosticListeners = new Set<ScannerDiagnosticListener>();
  private generation = 0;
  private lifecycleGeneration = 0;
  private stopPromise: Promise<void> | null = null;
  private activeDecodeController: AbortController | null = null;
  private frameSequence = 0;
  private eventSequence = 0;
  private startedAt = 0;
  private firstDecodeAt?: number;
  private firstConfirmedAt?: number;
  private decodeLatencies: number[] = [];
  private peakControlledMemory = 0;
  private currentWorkerMemory = 0;
  private counters = {
    capturedFrames: 0, admittedFrames: 0, droppedFrames: 0, qualityRejectedFrames: 0, periodicProbeFrames: 0,
    fastAttempts: 0, balancedAttempts: 0, robustAttempts: 0, decodeSuccesses: 0, confirmedEvents: 0,
    emittedEvents: 0, suppressedRepeats: 0, staleResultsDiscarded: 0, staleEvents: 0, lostEvents: 0,
  };

  constructor(options: ScannerSessionOptions) {
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
    const trackSource = options.source as CameraFrameSource & { currentTrack?: () => MediaStreamTrack | undefined };
    this.capabilityController = options.capabilityController ?? (typeof trackSource.currentTrack === "function" ? new CameraCapabilityController(() => trackSource.currentTrack?.(), this.autoZoom) : undefined);
    this.qualityProbeInterval = Math.max(1, Math.floor(options.qualityProbeInterval ?? 10));
    this.scheduler = new FrameScheduler((frame) => this.processFrame(frame), {
      initialDecodeFps: 10, minimumDecodeFps: 5, maximumDecodeFps: 15, ...options.scheduler,
      onAdmitted: () => { this.counters.admittedFrames += 1; },
      onDropped: () => { this.counters.droppedFrames += 1; },
    });
  }

  getState(): ScannerSessionState { return this.state; }

  async start(): Promise<void> {
    if (this.state === "scanning" || this.state === "starting") return;
    if (this.state === "stopping") throw new Error("Scanner session is stopping.");
    if (this.state === "failed" || this.state === "stopped") this.reset();
    this.setState("starting");
    const lifecycleGeneration = ++this.lifecycleGeneration;
    this.generation += 1;
    this.startedAt = Date.now();
    this.quality.reset(); this.escalation.reset(); this.scheduler.reset(); this.trackingRuntime?.reset();
    this.scheduler.start();
    try {
      await this.source.start(
        (frame) => this.acceptFrame(frame, lifecycleGeneration),
        (error) => this.handleSourceError(error, lifecycleGeneration),
        () => this.handleSourceEnded(lifecycleGeneration),
      );
      if (lifecycleGeneration === this.lifecycleGeneration && this.getState() === "starting") this.setState("scanning");
    } catch (error) {
      if (lifecycleGeneration !== this.lifecycleGeneration || this.getState() !== "starting") return;
      this.setState("failed");
      this.emitDiagnostic({ type: "error", timestamp: Date.now(), error: sdkError("camera_unavailable", error instanceof Error ? error.message : String(error)) });
      throw error;
    }
  }

  pause(): void {
    if (this.state !== "scanning") return;
    this.source.pause?.(); this.scheduler.pause(); this.activeDecodeController?.abort(); this.decoder.cancel(); this.generation += 1; this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.generation += 1; this.source.resume?.(); this.scheduler.resume(); this.setState("scanning");
  }

  async switchSource(source: CameraFrameSource, capabilityController?: CameraCapabilityController): Promise<void> {
    const restart = this.state === "scanning" || this.state === "paused" || this.state === "starting";
    await this.stop();
    this.source = source;
    const trackSource = source as CameraFrameSource & { currentTrack?: () => MediaStreamTrack | undefined };
    this.capabilityController = capabilityController ?? (typeof trackSource.currentTrack === "function" ? new CameraCapabilityController(() => trackSource.currentTrack?.(), this.autoZoom) : undefined);
    this.reset();
    if (restart) await this.start();
  }

  async stop(): Promise<void> {
    if (["idle", "stopped"].includes(this.state)) return;
    if (this.state === "stopping") { await this.stopPromise; return; }
    this.lifecycleGeneration += 1;
    this.generation += 1; this.activeDecodeController?.abort(); this.decoder.cancel();
    const stopping = Promise.resolve().then(async () => {
      try {
        await this.source.stop();
      } finally {
        await this.scheduler.stop();
        this.candidates.reset(); this.repeats.reset(); this.roi.reset(); this.trackingRuntime?.reset();
        this.setState("stopped");
        this.emitDiagnostic({ type: "scheduler", timestamp: Date.now(), detail: "session stopped; pending frames and active decode are zero" });
      }
    });
    this.stopPromise = stopping;
    this.setState("stopping");
    try { await stopping; } finally { if (this.stopPromise === stopping) this.stopPromise = null; }
  }

  reset(): void {
    if (this.state === "scanning" || this.state === "starting" || this.state === "paused") throw new Error("Stop the scanner session before reset().");
    this.lifecycleGeneration += 1; this.generation += 1; this.candidates.reset(); this.repeats.reset(); this.roi.reset(); this.trackingRuntime?.reset(); this.escalation.reset(); this.quality.reset(); this.scheduler.reset();
    this.decodeLatencies = []; this.firstDecodeAt = undefined; this.firstConfirmedAt = undefined; this.startedAt = 0; this.peakControlledMemory = 0; this.currentWorkerMemory = 0;
    this.counters = { capturedFrames: 0, admittedFrames: 0, droppedFrames: 0, qualityRejectedFrames: 0, periodicProbeFrames: 0, fastAttempts: 0, balancedAttempts: 0, robustAttempts: 0, decodeSuccesses: 0, confirmedEvents: 0, emittedEvents: 0, suppressedRepeats: 0, staleResultsDiscarded: 0, staleEvents: 0, lostEvents: 0 };
    this.setState("idle");
  }

  async dispose(): Promise<void> { await this.stop(); if (this.ownsDecoder) await this.decoder.dispose(); this.resultListeners.clear(); this.observationSetListeners.clear(); this.stateListeners.clear(); this.diagnosticListeners.clear(); }

  getStatistics(): ScannerSessionStatistics {
    const scheduler = this.scheduler.getStatistics(); const decoder = this.decoder.getStatistics?.();
    const now = Date.now(); const elapsed = Math.max(1, now - (this.startedAt || now));
    const sorted = [...this.decodeLatencies].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
    const currentWorkerMemory = decoder?.wasmCurrentLinearMemoryBytes ?? this.currentWorkerMemory;
    const wasmInputAllocationBytes = decoder?.wasmInputAllocationBytes ?? 0;
    const recoveryTemporaryBytes = decoder?.recoveryTemporaryBytes ?? 0;
    const recoveryRouteStateCount = decoder?.recoveryRouteStateCount ?? 0;
    const decoderControlledMemory = Math.max(currentWorkerMemory, wasmInputAllocationBytes, recoveryTemporaryBytes);
    const temporalControlledState = this.candidates.size + this.repeats.size + Number(this.roi.active) + (this.trackingRuntime?.controlledSize ?? 0);
    return { ...this.counters, averageDecodeMs: this.decodeLatencies.length ? this.decodeLatencies.reduce((a, b) => a + b, 0) / this.decodeLatencies.length : 0, p95DecodeMs: p95, effectiveDecodeFps: scheduler.effectiveDecodeFps || (this.counters.admittedFrames * 1_000 / elapsed), frameDropRate: this.counters.capturedFrames ? this.counters.droppedFrames / this.counters.capturedFrames : 0, ...(this.firstDecodeAt === undefined ? {} : { timeToFirstDecodeMs: this.firstDecodeAt - this.startedAt }), ...(this.firstConfirmedAt === undefined ? {} : { timeToFirstConfirmedScanMs: this.firstConfirmedAt - this.startedAt }), currentWorkerMemory, peakControlledMemory: Math.max(this.peakControlledMemory, decoder?.wasmPeakLinearMemoryBytes ?? 0, decoder?.recoveryPeakTemporaryBytes ?? 0), activeDecodeCount: scheduler.active, pendingFrameCount: scheduler.pending, peakPendingFrameCount: scheduler.peakPending, workerCreatedCount: decoder?.workerCreatedCount ?? 0, workerTerminatedCount: decoder?.workerTerminatedCount ?? 0, activeTaskCount: decoder?.activeTaskCount ?? 0, peakActiveTaskCount: decoder?.peakActiveTaskCount ?? 0, workerWasmDecodeCount: decoder?.workerWasmDecodeCount ?? 0, wasmInputAllocationBytes, wasmActiveNativeResultCount: decoder?.wasmActiveNativeResultCount ?? 0, wasmPeakLinearMemoryBytes: decoder?.wasmPeakLinearMemoryBytes ?? 0, wasmReleasedNativeResultCount: decoder?.wasmReleasedNativeResultCount ?? 0, recoveryRunCount: decoder?.recoveryRunCount ?? 0, recoveryTemporaryBytes, recoveryPeakTemporaryBytes: decoder?.recoveryPeakTemporaryBytes ?? 0, recoveryRouteStateCount, finalControlledMemory: scheduler.active + scheduler.pending + decoderControlledMemory + temporalControlledState + recoveryRouteStateCount };
  }

  onResult(listener: ScanResultListener): Unsubscribe { this.resultListeners.add(listener); return () => this.resultListeners.delete(listener); }
  onObservations(listener: BarcodeObservationSetListener): Unsubscribe { this.observationSetListeners.add(listener); return () => this.observationSetListeners.delete(listener); }
  onStateChange(listener: ScannerStateListener): Unsubscribe { this.stateListeners.add(listener); return () => this.stateListeners.delete(listener); }
  onDiagnostics(listener: ScannerDiagnosticListener): Unsubscribe { this.diagnosticListeners.add(listener); return () => this.diagnosticListeners.delete(listener); }
  getTracks(): readonly BarcodeTrack[] { return this.trackingRuntime?.getTracks() ?? []; }
  getTrackingStatistics(): TrackingStatistics | undefined { return this.trackingRuntime?.getStatistics(); }
  getCameraCapabilities(): CameraCapabilities { return this.capabilityController?.getCapabilities() ?? { torch: false, focusMode: false }; }
  setTorch(enabled: boolean): Promise<CapabilityResult<boolean>> { return this.capabilityController?.setTorch(enabled) ?? Promise.resolve({ ok: false, error: sdkError("unsupported_browser_capability", "Torch is not available for this scanner source.") }); }
  setZoom(value: number, manual = true): Promise<CapabilityResult<number>> { return this.capabilityController?.setZoom(value, manual) ?? Promise.resolve({ ok: false, error: sdkError("unsupported_browser_capability", "Zoom is not available for this scanner source.") }); }
  requestFocus(): Promise<CapabilityResult<boolean>> { return this.capabilityController?.requestFocus() ?? Promise.resolve({ ok: false, error: sdkError("unsupported_browser_capability", "Focus is not available for this scanner source.") }); }

  private async acceptFrame(frame: NormalizedFrame, lifecycleGeneration: number): Promise<void> {
    if (lifecycleGeneration !== this.lifecycleGeneration) {
      releaseFrame(frame);
      return;
    }
    this.counters.capturedFrames += 1;
    const release = once(() => { if (frame.ownership !== "borrowed") frame.dispose?.(); });
    const owned = { ...frame, dispose: release };
    this.scheduler.submit(owned);
    await this.scheduler.waitForIdle();
  }

  private async processFrame(frame: NormalizedFrame): Promise<FrameProcessFeedback> {
    const frameId = ++this.frameSequence; const now = frame.timestampMs || Date.now();
    const quality = this.quality.analyze(frame);
    this.emitDiagnostic({ type: "frame-quality", timestamp: now, frameId, quality });
    this.emitQualityHint(quality, frameId, now);
    const periodicProbe = this.counters.admittedFrames % this.qualityProbeInterval === 0;
    if (!quality.usable && !periodicProbe) { this.counters.qualityRejectedFrames += 1; this.roi.miss(); this.emitObservationSet({ frameId, timestamp: now, frameWidth: frame.width, frameHeight: frame.height, generation: this.generation, quality, decodeMode: this.decodeMode, observations: [] }); this.emitLost(now, frameId); releaseFrame(frame); return { quality, success: false }; }
    if (periodicProbe) this.counters.periodicProbeFrames += 1;
    const trackingSelection = this.trackingRuntime?.selectDecode(frameId, frame);
    const roi = trackingSelection ? trackingSelection.roi : this.roi.hint(frame, now);
    const roiPhase = trackingSelection?.phase ?? (roi ? "temporal" : "full-frame");
    const profile = this.trackingRuntime?.profile
      ?? this.escalation.select(quality, trackingSelection ? trackingSelection.plan.trackedROIs.length > 0 : this.roi.active, now);
    this.counters[`${profile}Attempts` as "fastAttempts" | "balancedAttempts" | "robustAttempts"] += 1;
    const generation = this.generation; const controller = new AbortController(); this.activeDecodeController = controller;
    const started = Date.now();
    let outcome: ScanOutcome;
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
    } catch (error) {
      outcome = { ok: false, error: sdkError("engine_execution_failure", error instanceof Error ? error.message : String(error), undefined, error), frameId: frame.id, scenarioId: profile, attemptCount: 0, timing: { totalMs: Date.now() - started } };
    } finally {
      if (this.activeDecodeController === controller) this.activeDecodeController = null;
    }
    const elapsed = Math.max(0, Date.now() - started); this.decodeLatencies.push(elapsed); if (this.decodeLatencies.length > 256) this.decodeLatencies.shift();
    this.currentWorkerMemory = outcome.timing.controlledMemory?.currentControlledBytes ?? 0; this.peakControlledMemory = Math.max(this.peakControlledMemory, outcome.timing.controlledMemory?.peakControlledBytes ?? 0);
    try {
      if (generation !== this.generation) { this.counters.staleResultsDiscarded += 1; return { quality, decodeMs: elapsed, success: false }; }
      if (outcome.ok) {
        const recoveryDiagnostic = ScannerDiagnostics.fromResult(outcome.primary);
        if (recoveryDiagnostic) this.emitDiagnostic({ type: "recovery", timestamp: now, frameId, profile, decodeMs: elapsed, recovery: recoveryDiagnostic, detail: ScannerDiagnostics.explain(recoveryDiagnostic).join(" ") });
        const observations = outcome.results.map((result) => {
          const geometry = geometryFor(result, frame);
          return { barcode: toDecodedBarcode(result), frameId, timestamp: now, ...(geometry ? { geometry } : {}) };
        });
        this.emitObservationSet({ frameId, timestamp: now, frameWidth: frame.width, frameHeight: frame.height, generation, quality, decodeMode: this.decodeMode, roiPhase, profile, decodeMs: elapsed, observations });
        this.emitLost(now, frameId);
        this.counters.decodeSuccesses += outcome.results.length; if (this.firstDecodeAt === undefined) this.firstDecodeAt = Date.now();
        this.escalation.observe(true, now); if (!this.trackingRuntime) this.roi.update(outcome.primary, frame, now);
        for (const result of outcome.results) this.observeResult(result, frame, quality, now, frameId, generation);
      } else {
        this.emitObservationSet({ frameId, timestamp: now, frameWidth: frame.width, frameHeight: frame.height, generation, quality, decodeMode: this.decodeMode, roiPhase, profile, decodeMs: elapsed, observations: [] });
        this.escalation.observe(false, now); if (!this.trackingRuntime) this.roi.miss(); if (!isNoResult(outcome)) this.emitDiagnostic({ type: "decode", timestamp: now, frameId, profile, decodeMs: elapsed, error: outcome.error });
        this.emitLost(now, frameId);
      }
      return { quality, decodeMs: elapsed, success: outcome.ok };
    } finally { releaseFrame(frame); }
  }

  private observeResult(result: ScanResult, frame: NormalizedFrame, quality: FrameQuality, now: number, frameId: number, generation: number): void {
    if (!this.canPublishGeneration(generation)) { this.counters.staleEvents += 1; return; }
    const barcode = toDecodedBarcode(result); const geometry = geometryFor(result, frame);
    const detected = this.event("detected", barcode, frameId, now, 1, geometry); this.emitDiagnostic({ type: "event", timestamp: now, frameId, event: detected });
    const observation = this.candidates.observe(barcode, geometry, quality, now);
    if (!observation.confirmed) return;
    if (observation.newlyConfirmed) {
      this.counters.confirmedEvents += 1; if (this.firstConfirmedAt === undefined) this.firstConfirmedAt = Date.now();
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
    if (!this.canPublishGeneration(generation)) { this.counters.staleEvents += 1; return; }
    this.counters.emittedEvents += 1;
    for (const listener of this.resultListeners) { try { listener(emitted); } catch (error) { this.emitDiagnostic({ type: "error", timestamp: now, frameId, error: sdkError("internal_invariant_failure", error instanceof Error ? error.message : String(error), undefined, error) }); } }
    this.emitDiagnostic({ type: "event", timestamp: now, frameId, event: emitted });
    if (this.capabilityController && this.autoZoom) void this.capabilityController.considerAutoZoom(geometry ?? { cornerPoints: [], boundingBox: { x: 0, y: 0, width: frame.width, height: frame.height } }, frame, now);
  }

  private emitLost(now: number, frameId: number): void {
    for (const lost of this.candidates.lost(now)) {
      this.counters.lostEvents += 1;
      const event = this.event("lost", lost.barcode, frameId, now, lost.candidate.observationCount, lost.candidate.latestGeometry);
      this.emitDiagnostic({ type: "event", timestamp: now, frameId, event });
    }
  }
  private event(type: ScanEvent["type"], barcode: DecodedBarcode, frameId: number, timestamp: number, observationCount: number, geometry?: BarcodeGeometry, physicalInstanceId?: string, suppressionReason?: string): ScanEvent {
    return { id: `scan-event-${++this.eventSequence}`, type, barcode, frameId, timestamp, observationCount, ...(geometry ? { geometry } : {}), ...(physicalInstanceId ? { physicalInstanceId } : {}), ...(suppressionReason ? { suppressionReason } : {}) };
  }
  private canPublishGeneration(generation: number): boolean { return generation === this.generation && (this.state === "starting" || this.state === "scanning"); }
  private emitObservationSet(set: BarcodeObservationSet): void {
    if (!this.canPublishGeneration(set.generation)) return;
    this.trackingRuntime?.observe(set);
    for (const listener of this.observationSetListeners) {
      try { listener(set); } catch (error) { this.emitDiagnostic({ type: "error", timestamp: set.timestamp, frameId: set.frameId, error: sdkError("internal_invariant_failure", error instanceof Error ? error.message : String(error), undefined, error) }); }
    }
  }
  private emitQualityHint(quality: FrameQuality, frameId: number, timestamp: number): void {
    const hint: ScannerHint = quality.underexposed ? { type: "increase_light", confidence: 1 - quality.brightness } : quality.overexposed || quality.glareDominated ? { type: "reduce_glare", confidence: Math.max(quality.glareRatio, quality.brightness) } : quality.blurred ? { type: "hold_steady", confidence: 1 - quality.blurScore } : { type: "searching", confidence: quality.usable ? 0.45 : 0.8 };
    this.emitDiagnostic({ type: "hint", timestamp, frameId, hint });
  }
  private handleSourceEnded(lifecycleGeneration: number): void {
    queueMicrotask(() => {
      if (lifecycleGeneration !== this.lifecycleGeneration || !["starting", "scanning", "paused"].includes(this.state)) return;
      void this.stop();
    });
  }
  private handleSourceError(error: unknown, lifecycleGeneration: number): void {
    if (lifecycleGeneration !== this.lifecycleGeneration || this.state === "stopping" || this.state === "stopped") return;
    this.lifecycleGeneration += 1; this.generation += 1;
    this.setState("failed"); this.activeDecodeController?.abort(); this.decoder.cancel(); void this.scheduler.stop(); void this.source.stop();
    this.emitDiagnostic({ type: "error", timestamp: Date.now(), error: sdkError("source_disconnected", error instanceof Error ? error.message : String(error), undefined, error) });
  }
  private setState(state: ScannerSessionState): void { if (this.state === state) return; this.state = state; for (const listener of this.stateListeners) { try { listener(state); } catch { /* listener failures do not own session state */ } } }
  private emitDiagnostic(diagnostic: ScannerDiagnostic): void { for (const listener of this.diagnosticListeners) { try { listener(diagnostic); } catch { /* diagnostics are observational */ } } }
}

function releaseFrame(frame: NormalizedFrame): void { frame.dispose?.(); }
