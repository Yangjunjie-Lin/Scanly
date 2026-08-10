import { createRgbaFrame, type NormalizedFrame, type ScanResult } from "@scanly/core";
import type { DecodeProfile, ScanEvent, ScannerSessionStatistics } from "@scanly/browser";

export type RealtimeFrameVisual = "clear" | "blurred" | "underexposed" | "glare" | "malformed";

export interface RealtimeGeometrySpec {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Decoder stimulus is intentionally separate from expected ground truth. */
export interface RealtimeDecodeStimulus {
  outcome: "miss" | "success" | "throw";
  payload?: string;
  format?: ScanResult["format"];
  geometry?: RealtimeGeometrySpec;
  latencyMs?: number;
  deferred?: boolean;
  /** A visible target outside the current ROI behaves as a miss until full-frame recovery. */
  requireTargetInRoi?: boolean;
}

export interface RealtimeFrameSpec {
  index: number;
  timestampMs: number;
  visual: RealtimeFrameVisual;
  decode: RealtimeDecodeStimulus;
}

export type RealtimeMetricName = keyof Pick<
  ScannerSessionStatistics,
  | "capturedFrames"
  | "admittedFrames"
  | "droppedFrames"
  | "qualityRejectedFrames"
  | "periodicProbeFrames"
  | "fastAttempts"
  | "balancedAttempts"
  | "robustAttempts"
  | "decodeSuccesses"
  | "confirmedEvents"
  | "emittedEvents"
  | "suppressedRepeats"
  | "staleResultsDiscarded"
  | "staleEvents"
  | "lostEvents"
  | "activeDecodeCount"
  | "pendingFrameCount"
  | "peakPendingFrameCount"
  | "workerCreatedCount"
  | "workerTerminatedCount"
  | "wasmInputAllocationBytes"
  | "wasmActiveNativeResultCount"
  | "finalControlledMemory"
>;

export interface RealtimeExpectedEvent {
  payload: string;
  format: ScanResult["format"];
}

/** Ground truth is never consulted by a decoder to manufacture an answer. */
export interface RealtimeScenarioExpected {
  emittedEvents: readonly RealtimeExpectedEvent[];
  maximumFalseConfirmedScans: number;
  maximumStaleEvents: number;
  maximumPendingFrames: number;
  physicalInstanceCount?: number;
  minimumDroppedFrames?: number;
  requiredProfiles?: readonly DecodeProfile[];
  requiredQualityFlags?: readonly ("underexposed" | "glareDominated" | "blurred")[];
  requiredDiagnostics?: readonly string[];
  requiredEventSubsequence?: readonly ScanEvent["type"][];
  minimumMetrics?: Readonly<Partial<Record<RealtimeMetricName, number>>>;
  maximumMetrics?: Readonly<Partial<Record<RealtimeMetricName, number>>>;
  firstEmissionObservationCount?: { minimum?: number; maximum?: number };
  latestDecodedFrameIndex?: number;
  requiredRuntimeEvidence?: readonly string[];
}

export type RealtimeDriverKind =
  | "sequence"
  | "pause-resume"
  | "stop-restart"
  | "cancellation"
  | "backpressure"
  | "worker-recovery"
  | "disposal";

export interface RealtimeSequenceScenario {
  id: string;
  description: string;
  driver: RealtimeDriverKind;
  timeline: readonly RealtimeFrameSpec[];
  expected: RealtimeScenarioExpected;
}

const QR = "qr_code" as const;
const event = (payload: string, format: ScanResult["format"] = QR): RealtimeExpectedEvent => ({ payload, format });
const geometry = (x: number, y = 12, width = 14, height = 14): RealtimeGeometrySpec => ({ x, y, width, height });
const stimulus = (
  index: number,
  options: Partial<Omit<RealtimeFrameSpec, "index" | "timestampMs">> & { timestampMs?: number } = {},
): RealtimeFrameSpec => ({
  index,
  timestampMs: options.timestampMs ?? 1_000 + index * 100,
  visual: options.visual ?? "clear",
  decode: options.decode ?? { outcome: "miss" },
});
const misses = (count: number, visual: RealtimeFrameVisual = "clear"): RealtimeFrameSpec[] =>
  Array.from({ length: count }, (_, index) => stimulus(index, { visual }));

const PAYLOADS = {
  a: "SCANLY-REALTIME-A",
  b: "SCANLY-REALTIME-REPEAT",
  c: "SCANLY-SAME-PAYLOAD",
  d: "SCANLY-BLUR-RECOVERY",
  e: "SCANLY-ROI-MOTION",
  f: "SCANLY-LOST-REENTRY",
  g: "SCANLY-UNDEREXPOSED",
  h: "SCANLY-GLARE-RECOVERY",
  i: "SCANLY-FAST-CONFIRM",
  j: "SCANLY-BALANCED-PROBE",
  k: "SCANLY-ROBUST-PROBE",
  l: "SCANLY-PAUSE-RESUME",
  m: "SCANLY-STOP-RESTART",
  n: "SCANLY-CANCELLED-OLD",
  o: "SCANLY-LATEST-FRAME",
  p: "SCANLY-STABLE-GEOMETRY",
  q: "SCANLY-JITTER-GEOMETRY",
  r: "SCANLY-MALFORMED-RECOVERY",
  s: "SCANLY-WORKER-RECOVERY",
  t: "SCANLY-DISPOSAL",
} as const;

const common = (emittedEvents: readonly RealtimeExpectedEvent[]): Pick<
  RealtimeScenarioExpected,
  "emittedEvents" | "maximumFalseConfirmedScans" | "maximumStaleEvents" | "maximumPendingFrames"
> => ({ emittedEvents, maximumFalseConfirmedScans: 0, maximumStaleEvents: 0, maximumPendingFrames: 1 });

/** Twenty independent semantic scenarios. Timeline stimuli and ground truth are separate fields. */
export const REALTIME_SEQUENCE_SCENARIOS: readonly RealtimeSequenceScenario[] = [
  {
    id: "sequence-a-escalation",
    description: "Fast-first misses trigger Balanced and a bounded Robust probe before confirmation.",
    driver: "sequence",
    timeline: [
      ...misses(8),
      stimulus(8, { decode: { outcome: "success", payload: PAYLOADS.a, geometry: geometry(18) } }),
      stimulus(9, { decode: { outcome: "success", payload: PAYLOADS.a, geometry: geometry(18) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.a)]),
      requiredProfiles: ["fast", "balanced", "robust"],
      minimumMetrics: { fastAttempts: 1, balancedAttempts: 1, robustAttempts: 1, confirmedEvents: 1 },
      requiredRuntimeEvidence: ["initial-fast", "consecutive-misses", "balanced-probe", "bounded-robust-probe"],
    },
  },
  {
    id: "sequence-b-repeat-50",
    description: "Fifty observations of one payload use once-per-session suppression.",
    driver: "sequence",
    timeline: Array.from({ length: 50 }, (_, index) => stimulus(index, { decode: { outcome: "success", payload: PAYLOADS.b, geometry: geometry(18) } })),
    expected: {
      ...common([event(PAYLOADS.b)]),
      minimumMetrics: { confirmedEvents: 1, emittedEvents: 1, suppressedRepeats: 1 },
      maximumMetrics: { emittedEvents: 1 },
      requiredRuntimeEvidence: ["repeat-policy-once-per-session", "fifty-identical-payload-frames"],
    },
  },
  {
    id: "sequence-c-same-payload-two-entities",
    description: "Equal payloads at separated geometry retain distinct physical instance identities.",
    driver: "sequence",
    timeline: [
      stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.c, geometry: geometry(4) } }),
      stimulus(1, { decode: { outcome: "success", payload: PAYLOADS.c, geometry: geometry(4) } }),
      stimulus(2), stimulus(3), stimulus(4), stimulus(5),
      stimulus(6, { decode: { outcome: "success", payload: PAYLOADS.c, geometry: geometry(44) } }),
      stimulus(7, { decode: { outcome: "success", payload: PAYLOADS.c, geometry: geometry(44) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.c), event(PAYLOADS.c)]),
      physicalInstanceCount: 2,
      minimumMetrics: { emittedEvents: 2 },
      maximumMetrics: { emittedEvents: 2 },
      requiredRuntimeEvidence: ["repeat-policy-physical-instance", "separated-geometry", "distinct-instance-identities"],
    },
  },
  {
    id: "sequence-d-blur-to-clear",
    description: "Actually blurred frames are rejected, periodically probed, then a clear frame confirms.",
    driver: "sequence",
    timeline: [
      ...misses(6, "blurred"),
      stimulus(6, { decode: { outcome: "success", payload: PAYLOADS.d, geometry: geometry(20) } }),
      stimulus(7, { decode: { outcome: "success", payload: PAYLOADS.d, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.d)]),
      requiredQualityFlags: ["blurred"],
      minimumMetrics: { qualityRejectedFrames: 1, periodicProbeFrames: 1, emittedEvents: 1 },
      requiredRuntimeEvidence: ["pixel-level-blur-to-clear-transition", "clear-frame-recovery"],
    },
  },
  {
    id: "sequence-e-roi-motion",
    description: "Decode geometry creates ROI; motion expands it; expiry recovers at full frame and tracks again.",
    driver: "sequence",
    timeline: [
      stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.e, geometry: geometry(4) } }),
      stimulus(1, { decode: { outcome: "success", payload: PAYLOADS.e, geometry: geometry(8) } }),
      ...Array.from({ length: 5 }, (_, offset) => stimulus(offset + 2, { decode: { outcome: "success", payload: PAYLOADS.e, geometry: geometry(42), requireTargetInRoi: true } })),
      stimulus(7, { decode: { outcome: "success", payload: PAYLOADS.e, geometry: geometry(43), requireTargetInRoi: true } }),
    ],
    expected: {
      ...common(Array.from({ length: 4 }, () => event(PAYLOADS.e))),
      minimumMetrics: { emittedEvents: 4 },
      maximumMetrics: { emittedEvents: 4 },
      requiredRuntimeEvidence: ["roi-request-recorded", "roi-expanded-after-miss", "full-frame-recovery", "moved-geometry-retracked"],
    },
  },
  {
    id: "sequence-f-lost-reentry",
    description: "A confirmed symbol is lost and later re-enters as a re-emittable physical instance.",
    driver: "sequence",
    timeline: [
      stimulus(0, { timestampMs: 1_000, decode: { outcome: "success", payload: PAYLOADS.f, geometry: geometry(8) } }),
      stimulus(1, { timestampMs: 1_800 }),
      stimulus(2, { timestampMs: 2_000, decode: { outcome: "success", payload: PAYLOADS.f, geometry: geometry(8) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.f), event(PAYLOADS.f)]),
      physicalInstanceCount: 2,
      requiredEventSubsequence: ["confirmed", "emitted", "lost", "confirmed", "emitted"],
      minimumMetrics: { confirmedEvents: 2, emittedEvents: 2, lostEvents: 1 },
      requiredRuntimeEvidence: ["lost-before-reentry", "policy-based-reemission"],
    },
  },
  {
    id: "sequence-g-underexposed-probe",
    description: "Low-luminance pixels are rejected with periodic probes before a clear recovery frame.",
    driver: "sequence",
    timeline: [
      ...misses(6, "underexposed"),
      stimulus(6, { decode: { outcome: "success", payload: PAYLOADS.g, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.g)]),
      requiredQualityFlags: ["underexposed"],
      minimumMetrics: { qualityRejectedFrames: 1, periodicProbeFrames: 1, emittedEvents: 1 },
      requiredRuntimeEvidence: ["low-luminance-pixels", "periodic-quality-probe", "valid-recovery-frame"],
    },
  },
  {
    id: "sequence-h-glare-recovery",
    description: "A real saturated pixel area is diagnosed before clear-frame recovery.",
    driver: "sequence",
    timeline: [
      ...misses(5, "glare"),
      stimulus(5, { decode: { outcome: "success", payload: PAYLOADS.h, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.h)]),
      requiredQualityFlags: ["glareDominated"],
      minimumMetrics: { qualityRejectedFrames: 1, emittedEvents: 1 },
      requiredRuntimeEvidence: ["saturated-pixel-area", "glare-diagnostic", "clear-frame-recovery"],
    },
  },
  {
    id: "sequence-i-fast-confirm",
    description: "Adaptive confirmation accepts one trusted, high-quality observation.",
    driver: "sequence",
    timeline: [stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.i, geometry: geometry(20) } })],
    expected: {
      ...common([event(PAYLOADS.i)]),
      firstEmissionObservationCount: { maximum: 1 },
      minimumMetrics: { confirmedEvents: 1, emittedEvents: 1 },
      requiredRuntimeEvidence: ["adaptive-confirmation", "trusted-high-quality-result", "ttfc-at-first-valid-observation"],
    },
  },
  {
    id: "sequence-j-balanced-probe",
    description: "Two Fast misses are followed by an explicit Balanced probe.",
    driver: "sequence",
    timeline: [
      stimulus(0), stimulus(1),
      stimulus(2, { decode: { outcome: "success", payload: PAYLOADS.j, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.j)]),
      requiredProfiles: ["fast", "balanced"],
      minimumMetrics: { fastAttempts: 2, balancedAttempts: 1 },
      requiredRuntimeEvidence: ["profile-prefix-fast-fast", "balanced-probe-received-by-decoder"],
    },
  },
  {
    id: "sequence-k-robust-bound",
    description: "Robust probes occur after misses but remain a small bounded fraction of admissions.",
    driver: "sequence",
    timeline: [
      ...misses(18),
      stimulus(18, { decode: { outcome: "success", payload: PAYLOADS.k, geometry: geometry(20) } }),
      stimulus(19, { decode: { outcome: "success", payload: PAYLOADS.k, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.k)]),
      requiredProfiles: ["robust"],
      minimumMetrics: { robustAttempts: 1 },
      requiredRuntimeEvidence: ["robust-probe-observed", "robust-probe-bounded-not-per-frame"],
    },
  },
  {
    id: "sequence-l-pause-resume",
    description: "The driver pauses a live session, proves no paused admission, resumes, and scans.",
    driver: "pause-resume",
    timeline: [
      stimulus(0, { decode: { outcome: "success", payload: "MUST-NOT-EMIT-WHILE-PAUSED", geometry: geometry(20) } }),
      stimulus(1, { decode: { outcome: "success", payload: PAYLOADS.l, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.l)]),
      requiredRuntimeEvidence: ["start-called", "pause-called", "zero-paused-admissions", "zero-paused-events", "resume-called"],
    },
  },
  {
    id: "sequence-m-stop-restart",
    description: "An old generation completes after stop; restart uses a new generation without leaking the old event.",
    driver: "stop-restart",
    timeline: [
      stimulus(0, { decode: { outcome: "success", payload: "MUST-NOT-EMIT-OLD-GENERATION", geometry: geometry(20), deferred: true } }),
      stimulus(1, { decode: { outcome: "success", payload: PAYLOADS.m, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.m)]),
      minimumMetrics: { staleResultsDiscarded: 1 },
      requiredRuntimeEvidence: ["start-stop-start", "distinct-generations", "old-result-discarded", "new-generation-usable"],
    },
  },
  {
    id: "sequence-n-cancellation",
    description: "A pending decode resolves after pause invalidation and cannot emit a public event.",
    driver: "cancellation",
    timeline: [stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.n, geometry: geometry(20), deferred: true } })],
    expected: {
      ...common([]),
      minimumMetrics: { staleResultsDiscarded: 1 },
      maximumMetrics: { emittedEvents: 0, staleEvents: 0 },
      requiredRuntimeEvidence: ["unresolved-decode", "generation-invalidation", "late-promise-completion", "zero-stale-public-events"],
    },
  },
  {
    id: "sequence-o-frame-drop",
    description: "A slow decoder under a fast producer retains one pending slot and processes the latest frame.",
    driver: "backpressure",
    timeline: Array.from({ length: 30 }, (_, index) => stimulus(index, {
      decode: index === 29
        ? { outcome: "success", payload: PAYLOADS.o, geometry: geometry(20), latencyMs: 15 }
        : { outcome: "miss", latencyMs: 15 },
    })),
    expected: {
      ...common([event(PAYLOADS.o)]),
      minimumDroppedFrames: 1,
      latestDecodedFrameIndex: 29,
      minimumMetrics: { droppedFrames: 1 },
      maximumMetrics: { activeDecodeCount: 0, pendingFrameCount: 0, peakPendingFrameCount: 1 },
      requiredRuntimeEvidence: ["slow-decoder", "single-active-decode", "single-latest-pending", "latest-frame-processed"],
    },
  },
  {
    id: "sequence-p-geometry-stable",
    description: "Stable geometry confirms on the second observation.",
    driver: "sequence",
    timeline: [
      stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.p, geometry: geometry(18) } }),
      stimulus(1, { decode: { outcome: "success", payload: PAYLOADS.p, geometry: geometry(19) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.p)]),
      firstEmissionObservationCount: { minimum: 2, maximum: 2 },
      requiredRuntimeEvidence: ["stable-geometry", "confirmation-on-second-observation"],
    },
  },
  {
    id: "sequence-q-geometry-jitter",
    description: "Large geometry jitter prevents early confirmation until a stable follow-up arrives.",
    driver: "sequence",
    timeline: [
      stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.q, geometry: geometry(2, 8, 10, 10) } }),
      stimulus(1, { decode: { outcome: "success", payload: PAYLOADS.q, geometry: geometry(24, 8, 10, 10) } }),
      stimulus(2, { decode: { outcome: "success", payload: PAYLOADS.q, geometry: geometry(46, 8, 10, 10) } }),
      stimulus(3, { decode: { outcome: "success", payload: PAYLOADS.q, geometry: geometry(46, 8, 10, 10) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.q)]),
      firstEmissionObservationCount: { minimum: 4 },
      requiredRuntimeEvidence: ["jittered-geometry", "no-early-confirmation", "extra-observation-required"],
    },
  },
  {
    id: "sequence-r-invalid-frame",
    description: "A truly malformed frame fails validation in the decoder and a later valid frame still emits.",
    driver: "sequence",
    timeline: [
      stimulus(0, { visual: "malformed", decode: { outcome: "throw" } }),
      stimulus(1, { decode: { outcome: "success", payload: PAYLOADS.r, geometry: geometry(20) } }),
    ],
    expected: {
      ...common([event(PAYLOADS.r)]),
      requiredDiagnostics: ["error:engine_execution_failure"],
      requiredRuntimeEvidence: ["malformed-buffer", "isolated-frame-failure", "later-valid-frame-emitted"],
    },
  },
  {
    id: "sequence-s-worker-recovery",
    description: "BrowserScannerFrameDecoder observes Worker failure and succeeds through main-thread fallback.",
    driver: "worker-recovery",
    timeline: [stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.s, geometry: geometry(20) } })],
    expected: {
      ...common([event(PAYLOADS.s)]),
      requiredRuntimeEvidence: ["browser-scanner-frame-decoder", "decode-worker-client", "worker-engine-failure", "main-thread-fallback", "session-remains-usable"],
    },
  },
  {
    id: "sequence-t-disposal",
    description: "Owned Worker decoder is disposed during a pending decode and ignores its late response.",
    driver: "disposal",
    timeline: [
      stimulus(0, { decode: { outcome: "success", payload: PAYLOADS.t, geometry: geometry(20) } }),
      stimulus(1, { decode: { outcome: "success", payload: "MUST-NOT-EMIT-AFTER-DISPOSE", geometry: geometry(20), deferred: true } }),
    ],
    expected: {
      ...common([event(PAYLOADS.t)]),
      minimumMetrics: { workerCreatedCount: 1, workerTerminatedCount: 1 },
      maximumMetrics: { activeDecodeCount: 0, pendingFrameCount: 0, wasmInputAllocationBytes: 0, wasmActiveNativeResultCount: 0, finalControlledMemory: 0 },
      requiredRuntimeEvidence: ["owned-worker", "dispose-during-pending-decode", "worker-terminated", "zero-final-controlled-memory", "zero-late-events"],
    },
  },
];

export function frameSpec(scenario: RealtimeSequenceScenario, index: number): RealtimeFrameSpec {
  const spec = scenario.timeline.find((entry) => entry.index === index);
  if (!spec) throw new Error(`Scenario ${scenario.id} has no frame ${index}.`);
  return spec;
}

function rgbaFor(spec: RealtimeFrameSpec, width: number, height: number): Uint8ClampedArray {
  if (spec.visual === "malformed") return new Uint8ClampedArray(8);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const checker = (Math.floor(x / 2) + Math.floor(y / 2) + spec.index) % 2 === 0;
      let value: number;
      if (spec.visual === "blurred") value = 128;
      else if (spec.visual === "underexposed") value = checker ? 2 : 24;
      else if (spec.visual === "glare") value = x < width * 0.4 ? 255 : (checker ? 25 : 180);
      else value = checker ? 20 : 235;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return data;
}

/** Frame pixels carry the claimed exposure/blur/glare state; labels are not used by quality analysis. */
export function makeSequenceFrame(scenario: RealtimeSequenceScenario, index: number): NormalizedFrame {
  const spec = frameSpec(scenario, index);
  const width = 64;
  const height = 64;
  const frame = createRgbaFrame(rgbaFor(spec, width, height), width, height, {
    id: `${scenario.id}:${index}`,
    timestampMs: spec.timestampMs,
    sourceType: "camera",
    ownership: "owned",
    device: { hardwareScannerId: scenario.id, scenarioFrameIndex: index },
  });
  if (spec.visual !== "malformed") return frame;
  return { ...frame, rowStride: 4 };
}

export function scenarioFrameIndex(frame: Pick<NormalizedFrame, "id">): number {
  const value = Number(frame.id.split(":").at(-1));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid realtime frame id: ${frame.id}`);
  return value;
}
