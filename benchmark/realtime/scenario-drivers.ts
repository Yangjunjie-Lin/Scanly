import {
  sdkError,
  validateFrame,
  type CaptureRouter,
  type NormalizedFrame,
  type ScanOutcome,
  type ScanResult,
} from "@scanly/core";
import {
  BrowserScannerFrameDecoder,
  DeterministicFrameSequenceSource,
  ScannerSession,
  type CameraFrameSource,
  type DecodeProfile,
  type DecodeWorkerLike,
  type RepeatPolicy,
  type ScanEvent,
  type ScannerDecodeRequest,
  type ScannerDiagnostic,
  type ScannerFrameDecoder,
  type ScannerSessionOptions,
  type ScannerSessionStatistics,
  type TemporalROIHint,
  type WorkerRequest,
  type WorkerResponse,
} from "@scanly/browser";
import {
  REALTIME_SEQUENCE_SCENARIOS,
  frameSpec,
  makeSequenceFrame,
  scenarioFrameIndex,
  type RealtimeDecodeStimulus,
  type RealtimeMetricName,
  type RealtimeScenarioExpected,
  type RealtimeSequenceScenario,
} from "./sequence-fixtures.js";

export interface RealtimeScenarioAssertion {
  id: string;
  pass: boolean;
  expected: unknown;
  observed: unknown;
  message: string;
}

export interface RealtimeProfileTimelineEntry {
  frameId: string;
  frameIndex: number;
  profile: DecodeProfile;
  generation: number;
  roi?: TemporalROIHint;
  executionPath?: "scripted-decoder" | "worker" | "main-thread-fallback";
  result?: "pending" | "miss" | "success" | "throw" | "worker-error" | "fallback-success" | "late-response";
  validationIssueCount?: number;
}

export interface RealtimeDiagnosticTimelineEntry {
  type: ScannerDiagnostic["type"];
  timestamp: number;
  frameId?: number;
  profile?: DecodeProfile;
  detail?: string;
  errorCode?: string;
  quality?: ScannerDiagnostic["quality"];
  event?: ScanEvent;
}

export interface RealtimeScenarioObserved {
  emittedEvents: Array<{ payload: string; format: string; physicalInstanceId?: string; observationCount: number }>;
  falseConfirmedScans: number;
  physicalInstanceIds: string[];
  decodedFrameIndices: number[];
  decodeGenerations: number[];
  decoderPeakActiveCount: number;
  repeatPolicyMode: RepeatPolicy["mode"];
  confirmationMode: string;
  qualityFlags: string[];
  eventTypes: ScanEvent["type"][];
  runtimeEvidence: string[];
  lifecycle: Record<string, unknown>;
  worker: Record<string, unknown>;
}

export type RealtimeScenarioMetrics = ScannerSessionStatistics & {
  TTFD: number | null;
  TTFC: number | null;
};

export interface RealtimeScenarioReport {
  id: string;
  description: string;
  expected: RealtimeScenarioExpected;
  observed: RealtimeScenarioObserved;
  assertions: RealtimeScenarioAssertion[];
  pass: boolean;
  failureReasons: string[];
  metrics: RealtimeScenarioMetrics;
  eventTimeline: ScanEvent[];
  profileTimeline: RealtimeProfileTimelineEntry[];
  diagnosticTimeline: RealtimeDiagnosticTimelineEntry[];
}

interface MutableExecutionEvidence {
  emitted: ScanEvent[];
  diagnostics: RealtimeDiagnosticTimelineEntry[];
  events: ScanEvent[];
  profileTimeline: RealtimeProfileTimelineEntry[];
  metrics?: ScannerSessionStatistics;
  lifecycle: Record<string, unknown>;
  worker: Record<string, unknown>;
  repeatPolicyMode: RepeatPolicy["mode"];
  confirmationMode: string;
  decoderPeakActiveCount: number;
}

interface ScenarioRuntime {
  evidence: MutableExecutionEvidence;
  scriptedDecoder?: ScriptedScenarioDecoder;
  browserDecoder?: BrowserScannerFrameDecoder;
  router?: HarnessRouter;
  failingWorker?: FailingDecodeWorker;
  controlledWorker?: ControlledDecodeWorker;
}

export interface RealtimeScenarioDriver {
  readonly id: string;
  readonly scenario: RealtimeSequenceScenario;
  createSource(): CameraFrameSource;
  configureSession(source: CameraFrameSource, runtime: ScenarioRuntime): ScannerSessionOptions;
  run(session: ScannerSession, source: CameraFrameSource, runtime: ScenarioRuntime): Promise<void>;
  assert(report: Omit<RealtimeScenarioReport, "assertions" | "pass" | "failureReasons">): RealtimeScenarioAssertion[];
}

function miss(frameId: string, profile: DecodeProfile): ScanOutcome {
  return {
    ok: false,
    error: sdkError("no_symbol_found", "Realtime scenario decoder found no symbol."),
    frameId,
    scenarioId: profile,
    attemptCount: 1,
    timing: { totalMs: 1 },
  };
}

function scanResult(frameId: string, stimulus: RealtimeDecodeStimulus, engineId = "jsqr"): ScanResult {
  const box = stimulus.geometry ?? { x: 16, y: 16, width: 16, height: 16 };
  const payload = stimulus.payload ?? "UNSPECIFIED-SCENARIO-PAYLOAD";
  return {
    format: stimulus.format ?? "qr_code",
    rawText: payload,
    cornerPoints: [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ],
    engine: { id: engineId, version: "realtime-evidence" },
    preprocessingPath: [],
    frameId,
    structuredPayload: null,
    validation: { valid: true, validatorIds: [], messages: [] },
    warnings: [],
    timing: { totalMs: 1 },
  };
}

function success(frameId: string, profile: DecodeProfile, stimulus: RealtimeDecodeStimulus, engineId = "jsqr"): ScanOutcome {
  const result = scanResult(frameId, stimulus, engineId);
  return {
    ok: true,
    results: [result],
    primary: result,
    frameId,
    scenarioId: profile,
    attemptCount: 1,
    timing: {
      totalMs: 1,
      controlledMemory: {
        currentControlledBytes: 0,
        peakControlledBytes: 4_096,
        retainedArtifactBytes: 0,
        retainedCacheBytes: 0,
        transientScratchBytes: 0,
      },
    },
  };
}

function targetInsideRoi(frame: NormalizedFrame, stimulus: RealtimeDecodeStimulus, roi?: TemporalROIHint): boolean {
  if (!stimulus.requireTargetInRoi || !roi || !stimulus.geometry) return true;
  const centerX = (stimulus.geometry.x + stimulus.geometry.width / 2) / frame.width;
  const centerY = (stimulus.geometry.y + stimulus.geometry.height / 2) / frame.height;
  return centerX >= roi.x && centerX <= roi.x + roi.width && centerY >= roi.y && centerY <= roi.y + roi.height;
}

class ScriptedScenarioDecoder implements ScannerFrameDecoder {
  readonly calls: RealtimeProfileTimelineEntry[] = [];
  private readonly pending = new Map<number, () => void>();
  private readonly pendingWaiters = new Map<number, Set<() => void>>();
  private active = 0;
  private peakActive = 0;
  private disposed = false;

  constructor(private readonly scenario: RealtimeSequenceScenario) {}

  async decode(frame: NormalizedFrame, request: ScannerDecodeRequest): Promise<ScanOutcome> {
    const index = scenarioFrameIndex(frame);
    const spec = frameSpec(this.scenario, index);
    const validationIssues = validateFrame(frame);
    const call: RealtimeProfileTimelineEntry = {
      frameId: frame.id,
      frameIndex: index,
      profile: request.profile,
      generation: request.generation,
      executionPath: "scripted-decoder",
      ...(request.roi ? { roi: { ...request.roi } } : {}),
      result: spec.decode.deferred ? "pending" : undefined,
      validationIssueCount: validationIssues.length,
    };
    this.calls.push(call);
    this.active += 1;
    this.peakActive = Math.max(this.peakActive, this.active);
    try {
      if (spec.decode.deferred) {
        await new Promise<void>((resolve) => {
          this.pending.set(index, resolve);
          for (const waiter of this.pendingWaiters.get(index) ?? []) waiter();
          this.pendingWaiters.delete(index);
        });
      }
      if (spec.decode.latencyMs) await new Promise<void>((resolve) => setTimeout(resolve, spec.decode.latencyMs));
      if (validationIssues.length || spec.decode.outcome === "throw") {
        call.result = "throw";
        throw new Error(validationIssues.length
          ? `Malformed frame rejected: ${validationIssues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`
          : "Scripted decoder failure.");
      }
      if (spec.decode.outcome === "success" && targetInsideRoi(frame, spec.decode, request.roi)) {
        call.result = "success";
        return success(frame.id, request.profile, spec.decode);
      }
      call.result = "miss";
      return miss(frame.id, request.profile);
    } finally {
      this.active -= 1;
    }
  }

  cancel(): void { /* Late-promise scenarios intentionally resolve after generation invalidation. */ }
  dispose(): void { this.disposed = true; }
  getStatistics() {
    return {
      workerCreatedCount: 0,
      workerTerminatedCount: 0,
      activeTaskCount: this.active,
      peakActiveTaskCount: this.peakActive,
      wasmInputAllocationBytes: 0,
      wasmActiveNativeResultCount: 0,
      wasmCurrentLinearMemoryBytes: 0,
      wasmPeakLinearMemoryBytes: 0,
    };
  }
  get peakActiveCount(): number { return this.peakActive; }
  get isDisposed(): boolean { return this.disposed; }

  async waitUntilPending(index: number): Promise<void> {
    if (this.pending.has(index)) return;
    await new Promise<void>((resolve) => {
      const waiters = this.pendingWaiters.get(index) ?? new Set<() => void>();
      waiters.add(resolve);
      this.pendingWaiters.set(index, waiters);
    });
  }

  resolvePending(index: number): void {
    const resolve = this.pending.get(index);
    if (!resolve) throw new Error(`Frame ${index} is not pending.`);
    this.pending.delete(index);
    resolve();
  }

  isPending(index: number): boolean { return this.pending.has(index); }
}

class ManualFrameSource implements CameraFrameSource {
  private onFrame?: (frame: NormalizedFrame) => Promise<void> | void;
  private stopped = true;
  private paused = false;
  starts = 0;
  stops = 0;

  async start(
    onFrame: (frame: NormalizedFrame) => Promise<void> | void,
    _onError: (error: unknown) => void,
    _onEnded: () => void,
  ): Promise<void> {
    this.onFrame = onFrame;
    this.stopped = false;
    this.paused = false;
    this.starts += 1;
  }

  pause(): void { if (!this.stopped) this.paused = true; }
  resume(): void { if (!this.stopped) this.paused = false; }
  stop(): void { this.stopped = true; this.paused = false; this.onFrame = undefined; this.stops += 1; }

  async push(frame: NormalizedFrame, bypassSourcePause = false): Promise<boolean> {
    if (this.stopped || (!bypassSourcePause && this.paused) || !this.onFrame) {
      if (frame.ownership !== "borrowed") frame.dispose?.();
      return false;
    }
    await this.onFrame(frame);
    return true;
  }
}

class HarnessRouter {
  readonly engines: Map<string, { getMemoryObservation: () => { inputAllocationBytes: number; activeNativeResultCount: number; currentLinearMemoryBytes: number; peakLinearMemoryBytes: number } }>;
  fallbackCalls = 0;
  readonly scanCalls: Array<{ frameId: string; frameIndex: number; profile: DecodeProfile; result: "fallback-success" | "miss" }> = [];
  disposed = false;
  private memory = { inputAllocationBytes: 0, activeNativeResultCount: 0, currentLinearMemoryBytes: 0, peakLinearMemoryBytes: 4_096 };

  constructor(private readonly scenario: RealtimeSequenceScenario) {
    this.engines = new Map([
      ["zxing-cpp-wasm", { getMemoryObservation: () => ({ ...this.memory }) }],
    ]);
  }

  async scan(frame: NormalizedFrame, options: { scenario?: { id?: string } } = {}): Promise<ScanOutcome> {
    this.fallbackCalls += 1;
    const spec = frameSpec(this.scenario, scenarioFrameIndex(frame));
    const profile = (["fast", "balanced", "robust"] as const).find((entry) => entry === options.scenario?.id) ?? "fast";
    this.scanCalls.push({ frameId: frame.id, frameIndex: scenarioFrameIndex(frame), profile, result: spec.decode.outcome === "success" ? "fallback-success" : "miss" });
    return spec.decode.outcome === "success" ? success(frame.id, profile, spec.decode, "zxing-cpp-wasm") : miss(frame.id, profile);
  }
  activateControlledResource(): void {
    this.memory = { inputAllocationBytes: 16_384, activeNativeResultCount: 1, currentLinearMemoryBytes: 65_536, peakLinearMemoryBytes: 65_536 };
  }
  releaseControlledResource(): void {
    this.memory = { ...this.memory, inputAllocationBytes: 0, activeNativeResultCount: 0, currentLinearMemoryBytes: 0 };
  }
  async dispose(): Promise<void> { this.disposed = true; }
}

abstract class BaseDecodeWorker implements DecodeWorkerLike {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = 0;
  scanRequests: Extract<WorkerRequest, { type: "scan" }>[] = [];
  activeScans = 0;
  peakActiveScans = 0;

  abstract postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void { this.terminated += 1; this.activeScans = 0; }

  protected receive(message: Extract<WorkerRequest, { type: "scan" }>): void {
    this.scanRequests.push(message);
    this.activeScans += 1;
    this.peakActiveScans = Math.max(this.peakActiveScans, this.activeScans);
  }
  protected respond(response: WorkerResponse): void {
    this.activeScans = Math.max(0, this.activeScans - 1);
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
  }
}

class FailingDecodeWorker extends BaseDecodeWorker {
  errorResponses = 0;
  postMessage(message: WorkerRequest): void {
    if (message.type !== "scan") return;
    this.receive(message);
    queueMicrotask(() => {
      this.errorResponses += 1;
      this.respond({ type: "error", jobId: message.jobId, generation: message.generation, message: "simulated engine execution failure" });
    });
  }
}

class ControlledDecodeWorker extends BaseDecodeWorker {
  private pendingLate?: Extract<WorkerRequest, { type: "scan" }>;
  readonly requestResults: Array<"pending" | "success" | "late-response"> = [];
  constructor(private readonly scenario: RealtimeSequenceScenario, private readonly router: HarnessRouter) { super(); }

  postMessage(message: WorkerRequest): void {
    if (message.type !== "scan") return;
    this.receive(message);
    const resultIndex = this.requestResults.push("pending") - 1;
    const spec = frameSpec(this.scenario, scenarioFrameIndex(message.frame));
    if (spec.decode.deferred) {
      this.pendingLate = message;
      this.router.activateControlledResource();
      return;
    }
    const outcome = success(message.frame.id, message.scenario.id as DecodeProfile, spec.decode, "zxing-cpp-wasm");
    queueMicrotask(() => {
      this.requestResults[resultIndex] = "success";
      this.respond({ type: "result", jobId: message.jobId, generation: message.generation, outcome });
    });
  }

  override terminate(): void { super.terminate(); this.router.releaseControlledResource(); }

  emitLateResponse(): void {
    const message = this.pendingLate;
    if (!message) throw new Error("No pending Worker response is available.");
    this.pendingLate = undefined;
    const spec = frameSpec(this.scenario, scenarioFrameIndex(message.frame));
    const outcome = success(message.frame.id, message.scenario.id as DecodeProfile, spec.decode, "zxing-cpp-wasm");
    this.requestResults[this.requestResults.length - 1] = "late-response";
    this.respond({ type: "result", jobId: message.jobId, generation: message.generation, outcome });
  }
}

function sessionPolicy(scenario: RealtimeSequenceScenario): {
  confirmation: NonNullable<ScannerSessionOptions["confirmation"]>;
  repeatPolicy: RepeatPolicy;
  qualityProbeInterval: number;
} {
  const confirmation = scenario.id === "sequence-a-escalation" || scenario.id === "sequence-p-geometry-stable" || scenario.id === "sequence-q-geometry-jitter"
    ? { mode: "confirm-two" as const, windowMs: 1_000 }
    : scenario.id === "sequence-f-lost-reentry"
      ? { mode: "adaptive" as const, lostAfterMs: 500, immediateQualityThreshold: 0.8 }
      : { mode: "adaptive" as const, immediateQualityThreshold: 0.8 };
  let repeatPolicy: RepeatPolicy = { mode: "once-per-session" };
  if (scenario.id === "sequence-c-same-payload-two-entities") repeatPolicy = { mode: "physical-instance", cooldownMs: 5_000, spatialSeparationRatio: 0.5 };
  if (scenario.id === "sequence-e-roi-motion") repeatPolicy = { mode: "allow" };
  if (scenario.id === "sequence-f-lost-reentry") repeatPolicy = { mode: "physical-instance", cooldownMs: 5_000, disappearanceMs: 500, spatialSeparationRatio: 0.5 };
  return { confirmation, repeatPolicy, qualityProbeInterval: scenario.id === "sequence-r-invalid-frame" ? 1 : 2 };
}

function baseSessionOptions(source: CameraFrameSource, scenario: RealtimeSequenceScenario, decoder?: ScannerFrameDecoder): ScannerSessionOptions {
  const policy = sessionPolicy(scenario);
  return {
    source,
    ...(decoder ? { decoder } : {}),
    confirmation: policy.confirmation,
    repeatPolicy: policy.repeatPolicy,
    qualityProbeInterval: policy.qualityProbeInterval,
    quality: { sampleTarget: 4_096 },
    scheduler: { initialDecodeFps: 1_000, minimumDecodeFps: 1_000, maximumDecodeFps: 1_000 },
    escalation: { balancedEveryMisses: 2, robustAfterMisses: 4, robustCooldownFrames: 8 },
    roi: { expansion: 0.2, maximumMisses: 4, timeoutMs: 5_000 },
  };
}

function newEvidence(scenario: RealtimeSequenceScenario): MutableExecutionEvidence {
  const policy = sessionPolicy(scenario);
  return {
    emitted: [],
    diagnostics: [],
    events: [],
    profileTimeline: [],
    lifecycle: {},
    worker: {},
    repeatPolicyMode: policy.repeatPolicy.mode,
    confirmationMode: policy.confirmation.mode ?? "adaptive",
    decoderPeakActiveCount: 0,
  };
}

function attachEvidence(session: ScannerSession, evidence: MutableExecutionEvidence): void {
  session.onResult((event) => evidence.emitted.push(event));
  session.onDiagnostics((diagnostic) => {
    if (diagnostic.event) evidence.events.push(diagnostic.event);
    evidence.diagnostics.push({
      type: diagnostic.type,
      timestamp: diagnostic.timestamp,
      ...(diagnostic.frameId === undefined ? {} : { frameId: diagnostic.frameId }),
      ...(diagnostic.profile === undefined ? {} : { profile: diagnostic.profile }),
      ...(diagnostic.detail === undefined ? {} : { detail: diagnostic.detail }),
      ...(diagnostic.error === undefined ? {} : { errorCode: diagnostic.error.code }),
      ...(diagnostic.quality === undefined ? {} : { quality: diagnostic.quality }),
      ...(diagnostic.event === undefined ? {} : { event: diagnostic.event }),
    });
  });
}

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}.`);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

const additiveMetrics: readonly RealtimeMetricName[] = [
  "capturedFrames", "admittedFrames", "droppedFrames", "qualityRejectedFrames", "periodicProbeFrames",
  "fastAttempts", "balancedAttempts", "robustAttempts", "decodeSuccesses", "confirmedEvents", "emittedEvents",
  "suppressedRepeats", "staleResultsDiscarded", "staleEvents", "lostEvents",
];

function combineStatistics(before: ScannerSessionStatistics, after: ScannerSessionStatistics): ScannerSessionStatistics {
  const beforeAttempts = before.fastAttempts + before.balancedAttempts + before.robustAttempts;
  const afterAttempts = after.fastAttempts + after.balancedAttempts + after.robustAttempts;
  const totalAttempts = beforeAttempts + afterAttempts;
  const elapsedBefore = before.effectiveDecodeFps > 0 ? before.admittedFrames * 1_000 / before.effectiveDecodeFps : 0;
  const elapsedAfter = after.effectiveDecodeFps > 0 ? after.admittedFrames * 1_000 / after.effectiveDecodeFps : 0;
  const totalElapsed = elapsedBefore + elapsedAfter;
  const combined: ScannerSessionStatistics = {
    ...after,
    peakPendingFrameCount: Math.max(before.peakPendingFrameCount, after.peakPendingFrameCount),
    peakControlledMemory: Math.max(before.peakControlledMemory ?? 0, after.peakControlledMemory ?? 0),
    averageDecodeMs: totalAttempts > 0 ? (before.averageDecodeMs * beforeAttempts + after.averageDecodeMs * afterAttempts) / totalAttempts : 0,
    p95DecodeMs: Math.max(before.p95DecodeMs, after.p95DecodeMs),
    effectiveDecodeFps: totalElapsed > 0 ? (before.admittedFrames + after.admittedFrames) * 1_000 / totalElapsed : 0,
    frameDropRate: (before.droppedFrames + after.droppedFrames) / Math.max(1, before.capturedFrames + after.capturedFrames),
  };
  for (const metric of additiveMetrics) combined[metric] = before[metric] + after[metric];
  return combined;
}

class SemanticScenarioDriver implements RealtimeScenarioDriver {
  readonly id: string;
  constructor(readonly scenario: RealtimeSequenceScenario) { this.id = scenario.id; }

  createSource(): CameraFrameSource {
    if (["pause-resume", "stop-restart", "cancellation", "disposal"].includes(this.scenario.driver)) return new ManualFrameSource();
    return new DeterministicFrameSequenceSource(
      () => this.scenario.timeline.map((spec) => makeSequenceFrame(this.scenario, spec.index)),
      { respectBackpressure: this.scenario.driver !== "backpressure" },
    );
  }

  configureSession(source: CameraFrameSource, runtime: ScenarioRuntime): ScannerSessionOptions {
    if (this.scenario.driver === "worker-recovery") {
      const worker = new FailingDecodeWorker();
      const router = new HarnessRouter(this.scenario);
      runtime.router = router;
      runtime.failingWorker = worker;
      runtime.evidence.worker.router = "HarnessRouter main-thread fallback";
      runtime.evidence.worker.workerFactoryCalls = 0;
      const decoder = new BrowserScannerFrameDecoder({
        router: router as unknown as CaptureRouter,
        workerFactory: () => {
          runtime.evidence.worker.workerFactoryCalls = Number(runtime.evidence.worker.workerFactoryCalls) + 1;
          return worker;
        },
        useWorker: true,
        disposeRouter: true,
      });
      runtime.browserDecoder = decoder;
      runtime.evidence.worker.routerFallbackCalls = 0;
      runtime.evidence.worker.routerDisposed = false;
      Object.defineProperty(runtime.evidence.worker, "routerEvidence", { value: router, enumerable: false });
      return baseSessionOptions(source, this.scenario, decoder);
    }
    if (this.scenario.driver === "disposal") {
      const router = new HarnessRouter(this.scenario);
      runtime.router = router;
      const worker = new ControlledDecodeWorker(this.scenario, router);
      runtime.controlledWorker = worker;
      runtime.evidence.worker.workerFactoryCalls = 0;
      Object.defineProperty(runtime.evidence.worker, "routerEvidence", { value: router, enumerable: false });
      return {
        ...baseSessionOptions(source, this.scenario),
        decoderOptions: {
          router: router as unknown as CaptureRouter,
          workerFactory: () => {
            runtime.evidence.worker.workerFactoryCalls = Number(runtime.evidence.worker.workerFactoryCalls) + 1;
            return worker;
          },
          useWorker: true,
          disposeRouter: true,
        },
      };
    }
    const decoder = new ScriptedScenarioDecoder(this.scenario);
    runtime.scriptedDecoder = decoder;
    return baseSessionOptions(source, this.scenario, decoder);
  }

  async run(session: ScannerSession, source: CameraFrameSource, runtime: ScenarioRuntime): Promise<void> {
    attachEvidence(session, runtime.evidence);
    if (this.scenario.driver === "sequence" || this.scenario.driver === "backpressure" || this.scenario.driver === "worker-recovery") {
      await session.start();
      await (source as DeterministicFrameSequenceSource).finished();
      await waitFor(() => session.getState() === "stopped", `${this.id} to stop after source completion`);
      runtime.evidence.metrics = session.getStatistics();
      if (runtime.scriptedDecoder) {
        runtime.evidence.profileTimeline = runtime.scriptedDecoder.calls;
        runtime.evidence.decoderPeakActiveCount = runtime.scriptedDecoder.peakActiveCount;
      }
      if (runtime.failingWorker) {
        const router = runtime.router;
        if (!router) throw new Error("Worker recovery router evidence is unavailable.");
        const workerTimeline: RealtimeProfileTimelineEntry[] = runtime.failingWorker.scanRequests.map((request) => ({
          frameId: request.frame.id,
          frameIndex: scenarioFrameIndex(request.frame),
          profile: request.scenario.id as DecodeProfile,
          generation: request.generation,
          executionPath: "worker",
          result: "worker-error",
        }));
        const fallbackTimeline: RealtimeProfileTimelineEntry[] = router.scanCalls.map((call) => ({
          frameId: call.frameId,
          frameIndex: call.frameIndex,
          profile: call.profile,
          generation: workerTimeline.find((entry) => entry.frameId === call.frameId)?.generation ?? 0,
          executionPath: "main-thread-fallback",
          result: call.result,
        }));
        runtime.evidence.profileTimeline = [...workerTimeline, ...fallbackTimeline];
        runtime.evidence.decoderPeakActiveCount = runtime.failingWorker.peakActiveScans;
        runtime.evidence.worker = {
          workerFactoryCalls: runtime.evidence.worker.workerFactoryCalls,
          workerErrorResponses: runtime.failingWorker.errorResponses,
          workerTerminations: runtime.failingWorker.terminated,
          routerFallbackCalls: router.fallbackCalls,
        };
      }
      await session.dispose();
      await runtime.browserDecoder?.dispose();
      if (runtime.failingWorker) {
        runtime.evidence.worker.routerDisposed = runtime.router?.disposed ?? false;
      }
      runtime.scriptedDecoder?.dispose();
      return;
    }

    const manual = source as ManualFrameSource;
    const decoder = runtime.scriptedDecoder;
    if (this.scenario.driver === "pause-resume") {
      if (!decoder) throw new Error("Pause/resume requires the scripted decoder.");
      await session.start();
      runtime.evidence.lifecycle.startCalled = manual.starts;
      session.pause();
      runtime.evidence.lifecycle.pauseCalled = session.getState() === "paused";
      const before = session.getStatistics();
      const delivered = await manual.push(makeSequenceFrame(this.scenario, 0), true);
      const paused = session.getStatistics();
      runtime.evidence.lifecycle.pausedFrameDelivered = delivered;
      runtime.evidence.lifecycle.pausedAdmissions = paused.admittedFrames - before.admittedFrames;
      runtime.evidence.lifecycle.pausedEmissions = runtime.evidence.emitted.length;
      session.resume();
      runtime.evidence.lifecycle.resumeCalled = session.getState() === "scanning";
      await manual.push(makeSequenceFrame(this.scenario, 1));
      await session.stop();
      runtime.evidence.metrics = session.getStatistics();
    } else if (this.scenario.driver === "stop-restart") {
      if (!decoder) throw new Error("Stop/restart requires the scripted decoder.");
      await session.start();
      const oldPush = manual.push(makeSequenceFrame(this.scenario, 0));
      await decoder.waitUntilPending(0);
      runtime.evidence.lifecycle.pendingBeforeStop = decoder.isPending(0);
      const stopping = session.stop();
      decoder.resolvePending(0);
      await Promise.all([oldPush, stopping]);
      const beforeRestart = session.getStatistics();
      runtime.evidence.lifecycle.beforeRestartMetrics = beforeRestart;
      runtime.evidence.lifecycle.oldGenerationStaleResults = beforeRestart.staleResultsDiscarded;
      runtime.evidence.lifecycle.eventsBeforeRestart = runtime.evidence.emitted.length;
      await session.start();
      await manual.push(makeSequenceFrame(this.scenario, 1));
      await session.stop();
      const afterRestart = session.getStatistics();
      runtime.evidence.lifecycle.afterRestartMetrics = afterRestart;
      runtime.evidence.metrics = combineStatistics(beforeRestart, afterRestart);
      runtime.evidence.lifecycle.sourceStarts = manual.starts;
      runtime.evidence.lifecycle.sourceStops = manual.stops;
    } else if (this.scenario.driver === "cancellation") {
      if (!decoder) throw new Error("Cancellation requires the scripted decoder.");
      await session.start();
      const pendingPush = manual.push(makeSequenceFrame(this.scenario, 0));
      await decoder.waitUntilPending(0);
      runtime.evidence.lifecycle.pendingBeforeInvalidation = decoder.isPending(0);
      session.pause();
      runtime.evidence.lifecycle.invalidatedState = session.getState();
      decoder.resolvePending(0);
      await pendingPush;
      runtime.evidence.lifecycle.eventsAfterLateCompletion = runtime.evidence.emitted.length;
      await session.stop();
      runtime.evidence.metrics = session.getStatistics();
    } else if (this.scenario.driver === "disposal") {
      const worker = runtime.controlledWorker;
      if (!worker) throw new Error("Disposal requires the controlled Worker.");
      await session.start();
      await manual.push(makeSequenceFrame(this.scenario, 0));
      const beforeLate = runtime.evidence.emitted.length;
      const pendingPush = manual.push(makeSequenceFrame(this.scenario, 1));
      await waitFor(() => worker.scanRequests.length === 2, "the disposal Worker pending request");
      const beforeDisposeMetrics = session.getStatistics();
      const statusAtDispose = [...worker.requestResults];
      await session.dispose();
      await pendingPush;
      worker.emitLateResponse();
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      runtime.evidence.metrics = session.getStatistics();
      const router = runtime.router;
      if (!router) throw new Error("Disposal router evidence is unavailable.");
      runtime.evidence.profileTimeline = worker.scanRequests.map((request, index) => ({
        frameId: request.frame.id,
        frameIndex: scenarioFrameIndex(request.frame),
        profile: request.scenario.id as DecodeProfile,
        generation: request.generation,
        executionPath: "worker",
        result: statusAtDispose[index],
      }));
      runtime.evidence.decoderPeakActiveCount = worker.peakActiveScans;
      runtime.evidence.worker = {
        workerCreatedCount: runtime.evidence.metrics.workerCreatedCount,
        workerFactoryCalls: runtime.evidence.worker.workerFactoryCalls,
        workerTerminatedCount: worker.terminated,
        peakActiveTaskCount: worker.peakActiveScans,
        routerDisposed: router.disposed,
        emittedBeforeDispose: beforeLate,
        emittedAfterLateResponse: runtime.evidence.emitted.length,
        memoryBeforeDispose: {
          wasmInputAllocationBytes: beforeDisposeMetrics.wasmInputAllocationBytes,
          wasmActiveNativeResultCount: beforeDisposeMetrics.wasmActiveNativeResultCount,
          currentWorkerMemory: beforeDisposeMetrics.currentWorkerMemory ?? 0,
        },
        memoryAfterDispose: {
          wasmInputAllocationBytes: runtime.evidence.metrics.wasmInputAllocationBytes,
          wasmActiveNativeResultCount: runtime.evidence.metrics.wasmActiveNativeResultCount,
          currentWorkerMemory: runtime.evidence.metrics.currentWorkerMemory ?? 0,
        },
      };
      return;
    }

    runtime.evidence.profileTimeline = decoder?.calls ?? [];
    runtime.evidence.decoderPeakActiveCount = decoder?.peakActiveCount ?? 0;
    await session.dispose();
    decoder?.dispose();
  }

  assert(report: Omit<RealtimeScenarioReport, "assertions" | "pass" | "failureReasons">): RealtimeScenarioAssertion[] {
    return [...genericAssertions(report), ...semanticAssertions(report)];
  }
}

function assertion(id: string, pass: boolean, expected: unknown, observed: unknown, message: string): RealtimeScenarioAssertion {
  return { id, pass, expected, observed, message };
}

function containsSubsequence<T>(values: readonly T[], expected: readonly T[]): boolean {
  let cursor = 0;
  for (const value of values) if (value === expected[cursor]) cursor += 1;
  return cursor === expected.length;
}

function genericAssertions(report: Omit<RealtimeScenarioReport, "assertions" | "pass" | "failureReasons">): RealtimeScenarioAssertion[] {
  const { expected, observed, metrics } = report;
  const expectedEvents = expected.emittedEvents.map((entry) => `${entry.format}\u001f${entry.payload}`);
  const observedEvents = observed.emittedEvents.map((entry) => `${entry.format}\u001f${entry.payload}`);
  const checks: RealtimeScenarioAssertion[] = [
    assertion("ground-truth-emitted-events", JSON.stringify(observedEvents) === JSON.stringify(expectedEvents), expectedEvents, observedEvents, "Emitted payload/format timeline must match independent ground truth."),
    assertion("false-confirmed-scan-gate", observed.falseConfirmedScans <= expected.maximumFalseConfirmedScans, expected.maximumFalseConfirmedScans, observed.falseConfirmedScans, "False confirmed scans are derived from unexpected emitted events."),
    assertion("stale-public-event-gate", metrics.staleEvents <= expected.maximumStaleEvents, expected.maximumStaleEvents, metrics.staleEvents, "No stale public event may escape generation checks."),
    assertion("pending-frame-bound", metrics.peakPendingFrameCount <= expected.maximumPendingFrames, expected.maximumPendingFrames, metrics.peakPendingFrameCount, "Pending queue must remain bounded."),
  ];
  if (expected.physicalInstanceCount !== undefined) checks.push(assertion(
    "physical-instance-count",
    new Set(observed.physicalInstanceIds).size === expected.physicalInstanceCount,
    expected.physicalInstanceCount,
    new Set(observed.physicalInstanceIds).size,
    "Physical-instance identity, not event count alone, must match ground truth.",
  ));
  if (expected.minimumDroppedFrames !== undefined) checks.push(assertion("minimum-dropped-frames", metrics.droppedFrames >= expected.minimumDroppedFrames, expected.minimumDroppedFrames, metrics.droppedFrames, "Backpressure must produce actual frame replacement."));
  for (const profile of expected.requiredProfiles ?? []) checks.push(assertion(`required-profile:${profile}`, report.profileTimeline.some((entry) => entry.profile === profile), profile, report.profileTimeline.map((entry) => entry.profile), `Decoder must receive the ${profile} profile.`));
  for (const flag of expected.requiredQualityFlags ?? []) checks.push(assertion(`required-quality:${flag}`, observed.qualityFlags.includes(flag), true, observed.qualityFlags.includes(flag), `Frame pixels must produce quality.${flag}=true.`));
  for (const diagnostic of expected.requiredDiagnostics ?? []) {
    const [kind, value] = diagnostic.split(":");
    const found = kind === "error" && report.diagnosticTimeline.some((entry) => entry.errorCode === value);
    checks.push(assertion(`required-diagnostic:${diagnostic}`, found, diagnostic, report.diagnosticTimeline.filter((entry) => entry.errorCode).map((entry) => `error:${entry.errorCode}`), `Required diagnostic ${diagnostic} must be observed.`));
  }
  if (expected.requiredEventSubsequence) checks.push(assertion("required-event-subsequence", containsSubsequence(observed.eventTypes, expected.requiredEventSubsequence), expected.requiredEventSubsequence, observed.eventTypes, "Lifecycle event ordering must contain the expected subsequence."));
  for (const [metric, minimum] of Object.entries(expected.minimumMetrics ?? {}) as Array<[RealtimeMetricName, number]>) checks.push(assertion(`minimum-metric:${metric}`, metrics[metric] >= minimum, minimum, metrics[metric], `${metric} must meet its scenario minimum.`));
  for (const [metric, maximum] of Object.entries(expected.maximumMetrics ?? {}) as Array<[RealtimeMetricName, number]>) checks.push(assertion(`maximum-metric:${metric}`, metrics[metric] <= maximum, maximum, metrics[metric], `${metric} must remain within its scenario maximum.`));
  const firstObservation = observed.emittedEvents[0]?.observationCount;
  if (expected.firstEmissionObservationCount?.minimum !== undefined) checks.push(assertion("first-emission-observation-minimum", firstObservation !== undefined && firstObservation >= expected.firstEmissionObservationCount.minimum, expected.firstEmissionObservationCount.minimum, firstObservation, "The first emission must not confirm before the required observation count."));
  if (expected.firstEmissionObservationCount?.maximum !== undefined) checks.push(assertion("first-emission-observation-maximum", firstObservation !== undefined && firstObservation <= expected.firstEmissionObservationCount.maximum, expected.firstEmissionObservationCount.maximum, firstObservation, "The first emission must confirm within the required observation count."));
  if (expected.latestDecodedFrameIndex !== undefined) checks.push(assertion("latest-frame-policy", observed.decodedFrameIndices.at(-1) === expected.latestDecodedFrameIndex, expected.latestDecodedFrameIndex, observed.decodedFrameIndices.at(-1), "The pending slot must retain the latest frame."));
  return checks;
}

function semanticAssertions(report: Omit<RealtimeScenarioReport, "assertions" | "pass" | "failureReasons">): RealtimeScenarioAssertion[] {
  const { id, observed, metrics, profileTimeline, diagnosticTimeline } = report;
  const checks: RealtimeScenarioAssertion[] = [];
  const add = (evidenceId: string, pass: boolean, expected: unknown, actual: unknown, message: string) => checks.push(assertion(evidenceId, pass, expected, actual, message));
  const profiles = profileTimeline.map((entry) => entry.profile);
  const quality = diagnosticTimeline.filter((entry) => entry.quality).map((entry) => entry.quality!);

  if (id === "sequence-a-escalation") {
    add("initial-fast", profiles[0] === "fast", "fast", profiles[0], "Escalation must start with Fast.");
    add("consecutive-misses", profileTimeline.slice(0, 2).every((entry) => entry.result === "miss"), ["miss", "miss"], profileTimeline.slice(0, 2).map((entry) => entry.result), "Miss evidence must precede escalation.");
    add("balanced-probe", profiles.includes("balanced"), true, profiles.includes("balanced"), "Balanced must be exercised after misses.");
    add("bounded-robust-probe", metrics.robustAttempts >= 1 && metrics.robustAttempts < metrics.admittedFrames / 2, "1 <= robustAttempts < admittedFrames/2", { robustAttempts: metrics.robustAttempts, admittedFrames: metrics.admittedFrames }, "Robust must occur as a bounded probe.");
  } else if (id === "sequence-b-repeat-50") {
    add("repeat-policy-once-per-session", observed.repeatPolicyMode === "once-per-session", "once-per-session", observed.repeatPolicyMode, "The session must really use once-per-session policy.");
    add("fifty-identical-payload-frames", profileTimeline.length === 50 && new Set(observed.emittedEvents.map((entry) => entry.payload)).size === 1, 50, profileTimeline.length, "All fifty held frames must execute through the scanner.");
  } else if (id === "sequence-c-same-payload-two-entities") {
    add("repeat-policy-physical-instance", observed.repeatPolicyMode === "physical-instance", "physical-instance", observed.repeatPolicyMode, "The session must use physical-instance policy.");
    const xs = report.eventTimeline.filter((entry) => entry.type === "emitted").map((entry) => entry.geometry?.boundingBox.x);
    add("separated-geometry", xs.length === 2 && Math.abs((xs[1] ?? 0) - (xs[0] ?? 0)) >= 20, "geometry separation >= 20px", xs, "Equal payloads must have visibly separated geometry.");
    add("distinct-instance-identities", new Set(observed.physicalInstanceIds).size === 2, 2, observed.physicalInstanceIds, "Emissions must carry distinct physical instance IDs.");
  } else if (id === "sequence-d-blur-to-clear") {
    add("pixel-level-blur-to-clear-transition", quality.slice(0, 6).some((entry) => entry.blurred) && quality.at(-1)?.usable === true, "blurred then usable", quality.map((entry) => ({ blurred: entry.blurred, usable: entry.usable })), "The actual pixel-derived quality timeline must recover from blur.");
    add("clear-frame-recovery", metrics.qualityRejectedFrames > 0 && metrics.emittedEvents > 0, true, { qualityRejectedFrames: metrics.qualityRejectedFrames, emittedEvents: metrics.emittedEvents }, "A clear frame must emit after early quality rejection.");
  } else if (id === "sequence-e-roi-motion") {
    const rois = profileTimeline.filter((entry) => entry.roi).map((entry) => ({ index: entry.frameIndex, ...entry.roi! }));
    const firstRoi = rois[0];
    add("roi-request-recorded", rois.length > 0, "> 0", rois.length, "Decoder requests must record a real ROI.");
    add("roi-expanded-after-miss", rois.some((entry) => firstRoi && entry.width > firstRoi.width), true, rois.map((entry) => entry.width), "ROI width must expand after misses.");
    add("full-frame-recovery", Boolean(firstRoi) && profileTimeline.some((entry) => entry.frameIndex > firstRoi.index && !entry.roi && entry.result === "success"), true, profileTimeline.map((entry) => ({ index: entry.frameIndex, roi: Boolean(entry.roi), result: entry.result })), "Expired ROI must permit a successful full-frame decode.");
    add("moved-geometry-retracked", profileTimeline.some((entry) => entry.frameIndex === 7 && entry.roi && entry.result === "success"), true, profileTimeline.at(-1), "After recovery, the moved target must be tracked with a new ROI.");
  } else if (id === "sequence-f-lost-reentry") {
    add("lost-before-reentry", containsSubsequence(observed.eventTypes, ["emitted", "lost", "emitted"]), ["emitted", "lost", "emitted"], observed.eventTypes, "Lost must occur before the re-entry emission.");
    add("policy-based-reemission", observed.emittedEvents.length === 2 && new Set(observed.physicalInstanceIds).size === 2, "two emissions with distinct identities", { emitted: observed.emittedEvents.length, ids: observed.physicalInstanceIds }, "Re-entry must be emitted according to physical-instance policy.");
  } else if (id === "sequence-g-underexposed-probe") {
    add("low-luminance-pixels", quality.some((entry) => entry.underexposed && entry.brightness < 0.12), "underexposed=true", quality.map((entry) => entry.brightness), "Pixel luminance must be genuinely underexposed.");
    add("periodic-quality-probe", metrics.periodicProbeFrames > 0, "> 0", metrics.periodicProbeFrames, "Rejected frames must retain periodic probes.");
    add("valid-recovery-frame", metrics.qualityRejectedFrames > 0 && metrics.emittedEvents === 1, true, { qualityRejectedFrames: metrics.qualityRejectedFrames, emittedEvents: metrics.emittedEvents }, "A later usable frame must recover scanning.");
  } else if (id === "sequence-h-glare-recovery") {
    add("saturated-pixel-area", quality.some((entry) => entry.glareRatio > 0.22), "glareRatio > 0.22", quality.map((entry) => entry.glareRatio), "Frame pixels must contain a saturated area.");
    add("glare-diagnostic", quality.some((entry) => entry.glareDominated), true, quality.map((entry) => entry.glareDominated), "Quality analysis must diagnose glareDominated.");
    add("clear-frame-recovery", quality.at(-1)?.usable === true && metrics.emittedEvents === 1, true, { lastUsable: quality.at(-1)?.usable, emittedEvents: metrics.emittedEvents }, "A clear frame must recover after glare.");
  } else if (id === "sequence-i-fast-confirm") {
    add("adaptive-confirmation", observed.confirmationMode === "adaptive", "adaptive", observed.confirmationMode, "Adaptive confirmation must be configured.");
    add("trusted-high-quality-result", quality[0]?.usable === true && observed.emittedEvents[0]?.observationCount === 1, true, { quality: quality[0], observationCount: observed.emittedEvents[0]?.observationCount }, "A trusted high-quality result must confirm in one observation.");
    add("ttfc-at-first-valid-observation", metrics.TTFD !== null && metrics.TTFC !== null && metrics.TTFC <= metrics.TTFD + 5, "TTFC <= TTFD + 5ms", { TTFD: metrics.TTFD, TTFC: metrics.TTFC }, "TTFC must be bounded by the first valid observation.");
  } else if (id === "sequence-j-balanced-probe") {
    add("profile-prefix-fast-fast", profiles[0] === "fast" && profiles[1] === "fast", ["fast", "fast"], profiles.slice(0, 2), "The decoder must receive Fast for the initial attempts.");
    add("balanced-probe-received-by-decoder", profiles[2] === "balanced", "balanced", profiles[2], "The decoder must explicitly receive Balanced next.");
  } else if (id === "sequence-k-robust-bound") {
    add("robust-probe-observed", metrics.robustAttempts >= 1, ">= 1", metrics.robustAttempts, "At least one Robust attempt is required.");
    add("robust-probe-bounded-not-per-frame", metrics.robustAttempts * 4 < metrics.admittedFrames, "robustAttempts * 4 < admittedFrames", { robustAttempts: metrics.robustAttempts, admittedFrames: metrics.admittedFrames }, "Robust must be far below total admitted frames.");
  } else if (id === "sequence-l-pause-resume") {
    add("start-called", Number(observed.lifecycle.startCalled) === 1, 1, observed.lifecycle.startCalled, "The live session must start.");
    add("pause-called", observed.lifecycle.pauseCalled === true, true, observed.lifecycle.pauseCalled, "pause() must transition the session.");
    add("zero-paused-admissions", observed.lifecycle.pausedFrameDelivered === true && observed.lifecycle.pausedAdmissions === 0, { callbackDelivered: true, admissions: 0 }, { callbackDelivered: observed.lifecycle.pausedFrameDelivered, admissions: observed.lifecycle.pausedAdmissions }, "Even a source callback racing across pause must admit no decode.");
    add("zero-paused-events", observed.lifecycle.pausedEmissions === 0, 0, observed.lifecycle.pausedEmissions, "Pause must emit no result.");
    add("resume-called", observed.lifecycle.resumeCalled === true && metrics.emittedEvents === 1, true, { resumeCalled: observed.lifecycle.resumeCalled, emittedEvents: metrics.emittedEvents }, "resume() must restore scanning.");
  } else if (id === "sequence-m-stop-restart") {
    add("start-stop-start", observed.lifecycle.sourceStarts === 2 && Number(observed.lifecycle.sourceStops) >= 2, "two starts and at least two stops", observed.lifecycle, "The driver must execute start/stop/start.");
    add("distinct-generations", new Set(observed.decodeGenerations).size === 2, 2, observed.decodeGenerations, "Restart must use a distinct generation.");
    add("old-result-discarded", observed.lifecycle.oldGenerationStaleResults === 1 && observed.lifecycle.eventsBeforeRestart === 0, { stale: 1, events: 0 }, { stale: observed.lifecycle.oldGenerationStaleResults, events: observed.lifecycle.eventsBeforeRestart }, "The old generation result must be discarded.");
    add("new-generation-usable", observed.emittedEvents.length === 1, 1, observed.emittedEvents.length, "The restarted session must remain usable.");
  } else if (id === "sequence-n-cancellation") {
    add("unresolved-decode", observed.lifecycle.pendingBeforeInvalidation === true && profileTimeline[0]?.result === "success" && profileTimeline.length === 1, "pending before invalidation, then one completion", { pendingBeforeInvalidation: observed.lifecycle.pendingBeforeInvalidation, profileTimeline }, "A pending decode must actually exist before invalidation.");
    add("generation-invalidation", observed.lifecycle.invalidatedState === "paused", "paused", observed.lifecycle.invalidatedState, "pause() must invalidate the generation.");
    add("late-promise-completion", metrics.staleResultsDiscarded > 0, "> 0", metrics.staleResultsDiscarded, "The old promise must complete and be counted as stale.");
    add("zero-stale-public-events", observed.lifecycle.eventsAfterLateCompletion === 0 && metrics.staleEvents === 0, 0, { emitted: observed.lifecycle.eventsAfterLateCompletion, staleEvents: metrics.staleEvents }, "Late completion must emit no public event.");
  } else if (id === "sequence-o-frame-drop") {
    add("slow-decoder", metrics.averageDecodeMs >= 10, ">= 10ms", metrics.averageDecodeMs, "The decoder must be measurably slow.");
    add("single-active-decode", observed.decoderPeakActiveCount <= 1, "<= 1", observed.decoderPeakActiveCount, "Only one decoder call may be active.");
    add("single-latest-pending", metrics.peakPendingFrameCount <= 1 && metrics.droppedFrames > 0, { peakPending: 1, dropped: "> 0" }, { peakPending: metrics.peakPendingFrameCount, dropped: metrics.droppedFrames }, "Backpressure must replace a single pending frame.");
    add("latest-frame-processed", observed.decodedFrameIndices.at(-1) === 29, 29, observed.decodedFrameIndices.at(-1), "The last decoded pending frame must be the producer's latest frame.");
  } else if (id === "sequence-p-geometry-stable") {
    add("stable-geometry", report.eventTimeline.find((entry) => entry.type === "emitted")?.observationCount === 2, 2, report.eventTimeline.find((entry) => entry.type === "emitted")?.observationCount, "Stable geometry must be observable in the confirmation count.");
    add("confirmation-on-second-observation", observed.emittedEvents[0]?.observationCount === 2, 2, observed.emittedEvents[0]?.observationCount, "Stable candidate must confirm on its second observation.");
  } else if (id === "sequence-q-geometry-jitter") {
    const detectedXs = report.eventTimeline.filter((entry) => entry.type === "detected").map((entry) => entry.geometry?.boundingBox.x);
    add("jittered-geometry", new Set(detectedXs).size >= 3, ">= 3 distinct positions", detectedXs, "The decoder must return genuinely jittered geometry.");
    add("no-early-confirmation", observed.emittedEvents[0]?.observationCount === 4, 4, observed.emittedEvents[0]?.observationCount, "Jitter must prevent confirmation on the second observation.");
    add("extra-observation-required", (observed.emittedEvents[0]?.observationCount ?? 0) > 2, "> 2", observed.emittedEvents[0]?.observationCount, "Jitter must require additional observations compared with stability.");
  } else if (id === "sequence-r-invalid-frame") {
    add("malformed-buffer", profileTimeline[0]?.validationIssueCount !== undefined && profileTimeline[0].validationIssueCount > 0, "> 0 validation issues", profileTimeline[0]?.validationIssueCount, "The frame itself must fail structural validation.");
    add("isolated-frame-failure", diagnosticTimeline.some((entry) => entry.errorCode === "engine_execution_failure"), "engine_execution_failure", diagnosticTimeline.map((entry) => entry.errorCode).filter(Boolean), "Malformed-frame failure must be isolated as a diagnostic.");
    add("later-valid-frame-emitted", observed.emittedEvents.length === 1 && profileTimeline.at(-1)?.result === "success", true, { emitted: observed.emittedEvents.length, lastResult: profileTimeline.at(-1)?.result }, "The session must continue to a later valid frame.");
  } else if (id === "sequence-s-worker-recovery") {
    const execution = profileTimeline.map((entry) => ({ path: entry.executionPath, result: entry.result }));
    add("browser-scanner-frame-decoder", Number(observed.worker.workerErrorResponses) === 1 && Number(observed.worker.workerFactoryCalls) === 1, { workerErrors: 1, factoryCalls: 1 }, { workerErrors: observed.worker.workerErrorResponses, factoryCalls: observed.worker.workerFactoryCalls }, "The BrowserScannerFrameDecoder Worker path must execute exactly once.");
    add("decode-worker-client", Number(observed.worker.workerTerminations) === 1, 1, observed.worker.workerTerminations, "DecodeWorkerClient must own and restart the failed Worker.");
    add("worker-engine-failure", execution.some((entry) => entry.path === "worker" && entry.result === "worker-error"), { path: "worker", result: "worker-error" }, execution, "The profile timeline must record the simulated Worker engine failure.");
    add("main-thread-fallback", Number(observed.worker.routerFallbackCalls) === 1 && execution.some((entry) => entry.path === "main-thread-fallback" && entry.result === "fallback-success"), { calls: 1, result: "fallback-success" }, { calls: observed.worker.routerFallbackCalls, execution }, "Main-thread router fallback success must actually run and be recorded.");
    add("session-remains-usable", observed.emittedEvents.length === 1, 1, observed.emittedEvents.length, "Fallback must leave the ScannerSession usable.");
  } else if (id === "sequence-t-disposal") {
    const before = (observed.worker.memoryBeforeDispose ?? {}) as Record<string, unknown>;
    const after = (observed.worker.memoryAfterDispose ?? {}) as Record<string, unknown>;
    add("owned-worker", observed.worker.workerCreatedCount === 1 && observed.worker.workerFactoryCalls === 1, { workerCreatedCount: 1, factoryCalls: 1 }, { workerCreatedCount: observed.worker.workerCreatedCount, factoryCalls: observed.worker.workerFactoryCalls }, "The owned decoder must invoke its Worker factory exactly once.");
    add("dispose-during-pending-decode", observed.worker.peakActiveTaskCount === 1 && profileTimeline.at(-1)?.result === "pending", true, { peak: observed.worker.peakActiveTaskCount, last: profileTimeline.at(-1)?.result }, "dispose() must run while a Worker decode is pending.");
    add("worker-terminated", observed.worker.workerTerminatedCount === 1, 1, observed.worker.workerTerminatedCount, "Owned Worker must terminate exactly once.");
    add("zero-final-controlled-memory", Number(before.wasmInputAllocationBytes) > 0 && Number(before.wasmActiveNativeResultCount) > 0 && Number(before.currentWorkerMemory) > 0 && Number(after.wasmInputAllocationBytes) === 0 && Number(after.wasmActiveNativeResultCount) === 0 && Number(after.currentWorkerMemory) === 0 && metrics.finalControlledMemory === 0, "non-zero live resources before dispose, zero after", { before, after, finalControlledMemory: metrics.finalControlledMemory }, "Disposal must demonstrate a non-zero to zero controlled resource transition.");
    add("zero-late-events", observed.worker.emittedAfterLateResponse === observed.worker.emittedBeforeDispose, observed.worker.emittedBeforeDispose, observed.worker.emittedAfterLateResponse, "A late Worker response after disposal must not emit.");
  }
  return checks;
}

export function deriveFalseConfirmedScans(events: readonly ScanEvent[], expected: RealtimeScenarioExpected): number {
  const remaining = expected.emittedEvents.map((entry) => `${entry.format}\u001f${entry.payload}`);
  let falseConfirmed = 0;
  for (const emitted of events) {
    const key = `${emitted.barcode.format}\u001f${emitted.barcode.text}`;
    const index = remaining.indexOf(key);
    if (index < 0) falseConfirmed += 1;
    else remaining.splice(index, 1);
  }
  if (expected.physicalInstanceCount !== undefined) {
    const ids = events.map((event) => event.physicalInstanceId).filter((value): value is string => Boolean(value));
    if (ids.length !== events.length || new Set(ids).size !== expected.physicalInstanceCount) falseConfirmed += 1;
  }
  return falseConfirmed;
}

function qualityFlags(diagnostics: readonly RealtimeDiagnosticTimelineEntry[]): string[] {
  const flags = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.quality?.underexposed) flags.add("underexposed");
    if (diagnostic.quality?.glareDominated) flags.add("glareDominated");
    if (diagnostic.quality?.blurred) flags.add("blurred");
  }
  return [...flags];
}

export const REALTIME_SCENARIO_DRIVERS: readonly RealtimeScenarioDriver[] = REALTIME_SEQUENCE_SCENARIOS.map((scenario) => new SemanticScenarioDriver(scenario));

export async function runRealtimeScenario(driver: RealtimeScenarioDriver): Promise<RealtimeScenarioReport> {
  const source = driver.createSource();
  const runtime: ScenarioRuntime = { evidence: newEvidence(driver.scenario) };
  const session = new ScannerSession(driver.configureSession(source, runtime));
  await driver.run(session, source, runtime);
  if (!runtime.evidence.metrics) throw new Error(`Scenario ${driver.id} did not record ScannerSession statistics.`);
  const statistics = runtime.evidence.metrics;
  const metrics: RealtimeScenarioMetrics = {
    ...statistics,
    TTFD: statistics.timeToFirstDecodeMs ?? null,
    TTFC: statistics.timeToFirstConfirmedScanMs ?? null,
  };
  const observedWithoutEvidence: Omit<RealtimeScenarioObserved, "runtimeEvidence"> = {
    emittedEvents: runtime.evidence.emitted.map((event) => ({
      payload: event.barcode.text,
      format: event.barcode.format,
      ...(event.physicalInstanceId ? { physicalInstanceId: event.physicalInstanceId } : {}),
      observationCount: event.observationCount,
    })),
    falseConfirmedScans: deriveFalseConfirmedScans(runtime.evidence.emitted, driver.scenario.expected),
    physicalInstanceIds: runtime.evidence.emitted.map((event) => event.physicalInstanceId).filter((value): value is string => Boolean(value)),
    decodedFrameIndices: runtime.evidence.profileTimeline.map((entry) => entry.frameIndex),
    decodeGenerations: runtime.evidence.profileTimeline.map((entry) => entry.generation),
    decoderPeakActiveCount: runtime.evidence.decoderPeakActiveCount,
    repeatPolicyMode: runtime.evidence.repeatPolicyMode,
    confirmationMode: runtime.evidence.confirmationMode,
    qualityFlags: qualityFlags(runtime.evidence.diagnostics),
    eventTypes: runtime.evidence.events.map((event) => event.type),
    lifecycle: runtime.evidence.lifecycle,
    worker: runtime.evidence.worker,
  };
  const partial = {
    id: driver.id,
    description: driver.scenario.description,
    expected: driver.scenario.expected,
    observed: { ...observedWithoutEvidence, runtimeEvidence: [] },
    metrics,
    eventTimeline: runtime.evidence.events,
    profileTimeline: runtime.evidence.profileTimeline,
    diagnosticTimeline: runtime.evidence.diagnostics,
  };
  let assertions = driver.assert(partial);
  const runtimeEvidence = assertions.filter((entry) => entry.pass && driver.scenario.expected.requiredRuntimeEvidence?.includes(entry.id)).map((entry) => entry.id);
  const observed: RealtimeScenarioObserved = { ...observedWithoutEvidence, runtimeEvidence };
  const withEvidence = { ...partial, observed };
  const missingEvidence = (driver.scenario.expected.requiredRuntimeEvidence ?? []).filter((entry) => !runtimeEvidence.includes(entry));
  assertions = [...driver.assert(withEvidence), assertion(
    "required-runtime-evidence",
    missingEvidence.length === 0,
    driver.scenario.expected.requiredRuntimeEvidence ?? [],
    runtimeEvidence,
    "Every named semantic claim must be backed by a passing observation-derived assertion.",
  )];
  const failureReasons = assertions.filter((entry) => !entry.pass).map((entry) => `${entry.id}: ${entry.message}`);
  return { ...withEvidence, assertions, pass: failureReasons.length === 0, failureReasons };
}
