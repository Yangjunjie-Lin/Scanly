import { createRgbaFrame, sdkError, type NormalizedFrame, type ScanOutcome, type ScanResult } from "@scanly/core";

export interface RealtimeSequenceScenario {
  id: string;
  description: string;
  frames: number;
  resultAt: number[];
  payload?: string;
  physicalInstances?: boolean;
  qualityPattern?: "clear" | "blurred" | "moving";
}

/** Twenty deterministic sequences exercise admission, escalation, temporal state and lifecycle boundaries. */
export const REALTIME_SEQUENCE_SCENARIOS: readonly RealtimeSequenceScenario[] = [
  { id: "sequence-a-escalation", description: "blank → small → clear barcode", frames: 8, resultAt: [4, 5] },
  { id: "sequence-b-repeat-50", description: "one payload held for fifty frames", frames: 50, resultAt: Array.from({ length: 50 }, (_, i) => i) },
  { id: "sequence-c-same-payload-two-entities", description: "same payload at separated geometry", frames: 12, resultAt: [2, 3, 8, 9], physicalInstances: true },
  { id: "sequence-d-blur-to-clear", description: "blurred frames followed by clear evidence", frames: 10, resultAt: [7, 8], qualityPattern: "blurred" },
  { id: "sequence-e-roi-motion", description: "barcode moves while ROI expands", frames: 14, resultAt: [2, 3, 7, 8], qualityPattern: "moving" },
  { id: "sequence-f-lost-reentry", description: "barcode leaves then re-enters", frames: 16, resultAt: [1, 2, 12, 13] },
  { id: "sequence-g-underexposed-probe", description: "underexposed periodic probes", frames: 20, resultAt: [19], qualityPattern: "blurred" },
  { id: "sequence-h-glare-recovery", description: "glare dominated then recovered", frames: 12, resultAt: [9, 10], qualityPattern: "blurred" },
  { id: "sequence-i-fast-confirm", description: "trusted engine immediate adaptive confirmation", frames: 6, resultAt: [1] },
  { id: "sequence-j-balanced-probe", description: "balanced probe after consecutive misses", frames: 12, resultAt: [10, 11] },
  { id: "sequence-k-robust-bound", description: "bounded robust probe after misses", frames: 20, resultAt: [18, 19] },
  { id: "sequence-l-pause-resume", description: "pause and resume retains no stale result", frames: 10, resultAt: [2, 8] },
  { id: "sequence-m-stop-restart", description: "stop then restart generation", frames: 8, resultAt: [3, 4] },
  { id: "sequence-n-cancellation", description: "cancelled decode cannot emit", frames: 8, resultAt: [4] },
  { id: "sequence-o-frame-drop", description: "latest frame survives pressure", frames: 30, resultAt: [28, 29] },
  { id: "sequence-p-geometry-stable", description: "stable geometry confirmation", frames: 9, resultAt: [3, 4] },
  { id: "sequence-q-geometry-jitter", description: "jitter requires extra observation", frames: 13, resultAt: [3, 5, 7] },
  { id: "sequence-r-invalid-frame", description: "malformed frame is isolated", frames: 7, resultAt: [5] },
  { id: "sequence-s-worker-recovery", description: "worker error falls back to router", frames: 9, resultAt: [6, 7] },
  { id: "sequence-t-disposal", description: "disposal drains all resources", frames: 11, resultAt: [4, 5] },
];

export function makeSequenceFrame(scenario: RealtimeSequenceScenario, index: number): NormalizedFrame {
  const data = new Uint8ClampedArray(64 * 64 * 4);
  const contrast = scenario.qualityPattern === "blurred" && index < Math.floor(scenario.frames * 0.6) ? 120 : 220;
  for (let offset = 0; offset < data.length; offset += 4) {
    const value = ((offset / 4 + index) % 2 === 0) ? 20 : contrast;
    data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  return createRgbaFrame(data, 64, 64, { id: `${scenario.id}-${index}`, timestampMs: index * 40, sourceType: "camera", ownership: "owned", device: { hardwareScannerId: scenario.id } });
}

export function resultForSequence(frame: NormalizedFrame, scenario: RealtimeSequenceScenario): ScanOutcome {
  const index = Number(frame.id.split("-").at(-1) ?? 0);
  if (!scenario.resultAt.includes(index)) return { ok: false, error: sdkError("no_symbol_found", "Deterministic sequence miss."), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
  const instance = scenario.physicalInstances && index >= 8 ? 32 : index;
  const scan: ScanResult = { format: "qr_code", rawText: scenario.payload ?? scenario.id, cornerPoints: [{ x: instance, y: 8 }, { x: instance + 12, y: 8 }, { x: instance + 12, y: 20 }, { x: instance, y: 20 }], engine: { id: "jsqr", version: "1" }, preprocessingPath: [], frameId: frame.id, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
  return { ok: true, results: [scan], primary: scan, frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } };
}
