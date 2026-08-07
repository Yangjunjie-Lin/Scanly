"use client";

import { useEffect, useState } from "react";
import {
  DeterministicFrameSequenceSource,
  ScannerSession,
  type CameraFrameSource,
  type ScanEvent,
  type ScannerDecodeRequest,
  type ScannerFrameDecoder,
  type ScannerSessionStatistics,
} from "@scanly/browser";
import { createRgbaFrame, sdkError, type NormalizedFrame, type ScanOutcome } from "@scanly/core";

type ScenarioName = "smoke" | "lifecycle" | "repeat" | "backpressure";

interface DecodeObservation {
  frameId: string;
  generation: number;
  abortedAtCompletion: boolean;
}

class TestDecoder implements ScannerFrameDecoder {
  readonly observations: DecodeObservation[] = [];
  activeCount = 0;
  peakActiveCount = 0;
  cancelCount = 0;

  constructor(private readonly implementation: (frame: NormalizedFrame, request: ScannerDecodeRequest) => Promise<ScanOutcome> | ScanOutcome) {}

  async decode(frame: NormalizedFrame, request: ScannerDecodeRequest): Promise<ScanOutcome> {
    const observation = { frameId: frame.id, generation: request.generation, abortedAtCompletion: false };
    this.observations.push(observation);
    this.activeCount += 1;
    this.peakActiveCount = Math.max(this.peakActiveCount, this.activeCount);
    try {
      return await this.implementation(frame, request);
    } finally {
      observation.abortedAtCompletion = request.signal.aborted;
      this.activeCount -= 1;
    }
  }

  cancel(): void { this.cancelCount += 1; }
  dispose(): void {}
  getStatistics() {
    return {
      workerCreatedCount: 0,
      workerTerminatedCount: 0,
      activeTaskCount: this.activeCount,
      peakActiveTaskCount: this.peakActiveCount,
    };
  }
}

class ManualFrameSource implements CameraFrameSource {
  private onFrame?: (frame: NormalizedFrame) => Promise<void> | void;
  private stopped = true;
  private paused = false;

  async start(
    onFrame: (frame: NormalizedFrame) => Promise<void> | void,
    _onError: (error: unknown) => void,
    _onEnded: () => void,
  ): Promise<void> {
    this.onFrame = onFrame;
    this.stopped = false;
    this.paused = false;
  }

  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }
  stop(): void { this.stopped = true; this.onFrame = undefined; }

  async push(frame: NormalizedFrame, bypassSourcePause = false): Promise<void> {
    if (this.stopped || !this.onFrame || (this.paused && !bypassSourcePause)) {
      frame.dispose?.();
      return;
    }
    await this.onFrame(frame);
  }
}

function sequenceFrame(index: number, prefix = "browser-sequence", onDispose?: (frameId: string) => void): NormalizedFrame {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    const value = (offset / 4 + index) % 2 ? 220 : 20;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  const id = `${prefix}-${index}`;
  return createRgbaFrame(data, 32, 32, {
    id,
    timestampMs: (index + 1) * 40,
    sourceType: "camera",
    ownership: "owned",
    ...(onDispose ? { dispose: () => onDispose(id) } : {}),
  });
}

function successfulOutcome(frame: NormalizedFrame, payload: string): ScanOutcome {
  const result = {
    format: "qr_code" as const,
    rawText: payload,
    cornerPoints: [{ x: 8, y: 8 }, { x: 24, y: 8 }, { x: 24, y: 24 }, { x: 8, y: 24 }],
    engine: { id: "jsqr", version: "browser-runtime-test" },
    preprocessingPath: [],
    frameId: frame.id,
    structuredPayload: null,
    validation: { valid: true, validatorIds: [], messages: [] },
    warnings: [],
    timing: { totalMs: 1 },
  };
  return { ok: true, results: [result], primary: result, frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
}

function missedOutcome(frame: NormalizedFrame): ScanOutcome {
  return { ok: false, error: sdkError("no_symbol_found", "browser runtime test miss"), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const delay = (milliseconds = 0) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function waitUntil(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}.`);
    await delay();
  }
}

async function waitForStopped(session: ScannerSession): Promise<void> {
  await waitUntil(() => session.getState() === "stopped", "ScannerSession to stop");
}

async function runSmokeScenario() {
  const source = new DeterministicFrameSequenceSource(function* () {
    for (let index = 0; index < 8; index += 1) yield sequenceFrame(index);
  });
  const decoder = new TestDecoder((input) => {
    const index = Number(input.id.split("-").at(-1) ?? 0);
    return index < 2 ? missedOutcome(input) : successfulOutcome(input, "BROWSER-SIMULATOR");
  });
  const session = new ScannerSession({
    source,
    decoder,
    confirmation: { mode: "confirm-two" },
    repeatPolicy: { mode: "once-per-session" },
    quality: { blurThreshold: 0, contrastThreshold: 0 },
  });
  await session.start();
  await source.finished();
  await waitForStopped(session);
  const statistics = session.getStatistics();
  await session.dispose();
  return { scenario: "smoke", browser: navigator.userAgent, ...statistics };
}

async function runLifecycleScenario() {
  const pauseCompletion = deferred<void>();
  const stopCompletion = deferred<void>();
  const source = new ManualFrameSource();
  const decoder = new TestDecoder(async (input) => {
    if (input.id === "lifecycle-before-pause-0") {
      await pauseCompletion.promise;
      return successfulOutcome(input, "LIFECYCLE-STALE-PAUSE");
    }
    if (input.id === "lifecycle-before-stop-0") {
      await stopCompletion.promise;
      return successfulOutcome(input, "LIFECYCLE-STALE-STOP");
    }
    return successfulOutcome(input, "LIFECYCLE-CURRENT");
  });
  const session = new ScannerSession({
    source,
    decoder,
    confirmation: { mode: "immediate" },
    repeatPolicy: { mode: "once-per-session" },
    quality: { blurThreshold: 0, contrastThreshold: 0 },
    scheduler: { initialDecodeFps: 1_000, minimumDecodeFps: 1_000, maximumDecodeFps: 1_000 },
  });
  const states = [session.getState()];
  const events: ScanEvent[] = [];
  session.onStateChange((state) => states.push(state));
  session.onResult((event) => events.push(event));

  await session.start();
  const beforePauseSubmission = source.push(sequenceFrame(0, "lifecycle-before-pause"));
  await waitUntil(() => decoder.observations.some(({ frameId }) => frameId === "lifecycle-before-pause-0"), "pre-pause decode admission");
  const beforePause = lifecycleSnapshot(session.getState(), session.getStatistics());
  const emittedBeforePause = events.length;
  session.pause();
  const pausedSubmission = source.push(sequenceFrame(0, "lifecycle-paused"), true);
  await delay();
  const duringPause = lifecycleSnapshot(session.getState(), session.getStatistics());
  pauseCompletion.resolve();
  await Promise.all([beforePauseSubmission, pausedSubmission]);
  const afterPausedDecodeCompletion = lifecycleSnapshot(session.getState(), session.getStatistics());
  const lateEventsDuringPause = events.length - emittedBeforePause;

  session.resume();
  await source.push(sequenceFrame(0, "lifecycle-after-resume"));
  const afterResume = lifecycleSnapshot(session.getState(), session.getStatistics());

  const beforeStopSubmission = source.push(sequenceFrame(0, "lifecycle-before-stop"));
  await waitUntil(() => decoder.observations.some(({ frameId }) => frameId === "lifecycle-before-stop-0"), "pre-stop decode admission");
  const emittedBeforeStop = events.length;
  const stopping = session.stop();
  stopCompletion.resolve();
  await Promise.all([beforeStopSubmission, stopping]);
  const finalStatistics = lifecycleSnapshot(session.getState(), session.getStatistics());
  const lateEventsAfterStop = events.length - emittedBeforeStop;
  await session.dispose();

  return {
    scenario: "lifecycle",
    browser: navigator.userAgent,
    states,
    observations: decoder.observations,
    decodedFrameIds: decoder.observations.map(({ frameId }) => frameId),
    emittedPayloads: events.map(({ barcode }) => barcode.text),
    beforePause,
    duringPause,
    afterPausedDecodeCompletion,
    afterResume,
    final: finalStatistics,
    lateEventsDuringPause,
    lateEventsAfterStop,
    cancelCount: decoder.cancelCount,
    decoderPeakActiveCount: decoder.peakActiveCount,
  };
}

function lifecycleSnapshot(state: string, statistics: ScannerSessionStatistics) {
  return {
    state,
    admittedFrames: statistics.admittedFrames,
    droppedFrames: statistics.droppedFrames,
    emittedEvents: statistics.emittedEvents,
    staleResultsDiscarded: statistics.staleResultsDiscarded,
    staleEvents: statistics.staleEvents,
    activeDecodeCount: statistics.activeDecodeCount,
    pendingFrameCount: statistics.pendingFrameCount,
    finalControlledMemory: statistics.finalControlledMemory,
  };
}

async function runRepeatScenario() {
  const frameCount = 50;
  const source = new DeterministicFrameSequenceSource(function* () {
    for (let index = 0; index < frameCount; index += 1) yield sequenceFrame(index, "repeat");
  });
  const decoder = new TestDecoder((input) => successfulOutcome(input, "BROWSER-REPEAT"));
  const session = new ScannerSession({
    source,
    decoder,
    confirmation: { mode: "confirm-two" },
    repeatPolicy: { mode: "once-per-session" },
    quality: { blurThreshold: 0, contrastThreshold: 0 },
    scheduler: { initialDecodeFps: 1_000, minimumDecodeFps: 1_000, maximumDecodeFps: 1_000 },
  });
  const emitted: ScanEvent[] = [];
  const diagnosticEvents: ScanEvent[] = [];
  session.onResult((event) => emitted.push(event));
  session.onDiagnostics((diagnostic) => { if (diagnostic.event) diagnosticEvents.push(diagnostic.event); });
  await session.start();
  await source.finished();
  await waitForStopped(session);
  const statistics = session.getStatistics();
  await session.dispose();
  return {
    scenario: "repeat",
    browser: navigator.userAgent,
    repeatPolicy: "once-per-session",
    frameCount,
    emittedPayloads: emitted.map(({ barcode }) => barcode.text),
    emittedPhysicalInstanceIds: emitted.map(({ physicalInstanceId }) => physicalInstanceId),
    diagnosticEventTypes: diagnosticEvents.map(({ type }) => type),
    statistics,
  };
}

async function runBackpressureScenario() {
  const frameCount = 24;
  const disposedFrameIds: string[] = [];
  const frames = Array.from({ length: frameCount }, (_, index) => sequenceFrame(index, "backpressure", (frameId) => disposedFrameIds.push(frameId)));
  const source = new DeterministicFrameSequenceSource(() => frames, { respectBackpressure: false });
  const decoder = new TestDecoder(async (input) => {
    await delay(75);
    return missedOutcome(input);
  });
  const session = new ScannerSession({
    source,
    decoder,
    quality: { blurThreshold: 0, contrastThreshold: 0 },
    scheduler: { initialDecodeFps: 1_000, minimumDecodeFps: 1_000, maximumDecodeFps: 1_000 },
  });
  await session.start();
  await source.finished();
  await waitForStopped(session);
  const statistics = session.getStatistics();
  await session.dispose();
  return {
    scenario: "backpressure",
    browser: navigator.userAgent,
    frameCount,
    expectedLatestFrameId: `backpressure-${frameCount - 1}`,
    decodedFrameIds: decoder.observations.map(({ frameId }) => frameId),
    disposedFrameIds,
    decoderPeakActiveCount: decoder.peakActiveCount,
    statistics,
  };
}

const scenarioRunners: Record<ScenarioName, () => Promise<unknown>> = {
  smoke: runSmokeScenario,
  lifecycle: runLifecycleScenario,
  repeat: runRepeatScenario,
  backpressure: runBackpressureScenario,
};

export default function ScannerRuntimeTestPage() {
  const [report, setReport] = useState("running");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const requested = new URLSearchParams(window.location.search).get("scenario") ?? "smoke";
      const scenario: ScenarioName = requested in scenarioRunners ? requested as ScenarioName : "smoke";
      try {
        const result = await scenarioRunners[scenario]();
        if (alive) setReport(JSON.stringify(result));
      } catch (error) {
        if (alive) setReport(JSON.stringify({ scenario, error: error instanceof Error ? error.message : String(error) }));
      }
    })();
    return () => { alive = false; };
  }, []);
  return <main><h1>ScannerSession simulator</h1><pre data-testid="scanner-runtime-report">{report}</pre></main>;
}
