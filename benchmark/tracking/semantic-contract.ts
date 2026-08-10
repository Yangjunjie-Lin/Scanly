export const TRACKING_SEMANTIC_CONTRACT_VERSION = "beta2-foundation-34-v1";

/**
 * Frozen independently from the executable fixtures. Renaming, removing, or
 * reclassifying a scenario therefore changes the evidence contract rather
 * than silently redefining what the benchmark claims to cover.
 */
export const TRACKING_SEMANTIC_SCENARIOS = [
  { id: "basic-scale-1-static", category: "basic" },
  { id: "basic-single-moving", category: "basic" },
  { id: "basic-size-change", category: "basic" },
  { id: "multi-scale-4-static", category: "multi-object" },
  { id: "multi-scale-8-static", category: "multi-object" },
  { id: "multi-scale-16-static", category: "multi-object" },
  { id: "multi-bounded-32-static", category: "multi-object" },
  { id: "multi-4-moving", category: "multi-object" },
  { id: "multi-8-moving", category: "multi-object" },
  { id: "identity-same-payload-two", category: "identity", samePayload: true },
  { id: "identity-same-payload-four", category: "identity", samePayload: true },
  { id: "identity-different-payload-crossing", category: "identity" },
  { id: "identity-same-payload-crossing", category: "identity", samePayload: true },
  { id: "identity-same-payload-parallel", category: "identity", samePayload: true },
  { id: "identity-close-proximity", category: "identity" },
  { id: "lifecycle-brief-occlusion", category: "lifecycle" },
  { id: "lifecycle-long-disappearance", category: "lifecycle" },
  { id: "lifecycle-leave-reentry", category: "lifecycle" },
  { id: "lifecycle-decoder-gap", category: "lifecycle" },
  { id: "batch-expected-count", category: "batch", batchMode: "expected-count" },
  { id: "batch-expected-count-incomplete", category: "batch", batchMode: "expected-count" },
  { id: "batch-checklist", category: "batch", batchMode: "checklist" },
  { id: "batch-duplicate-quantity", category: "batch", batchMode: "checklist", samePayload: true },
  { id: "batch-unexpected-item", category: "batch", batchMode: "checklist" },
  { id: "batch-checklist-missing", category: "batch", batchMode: "checklist" },
  { id: "batch-unique-physical-instance", category: "batch", batchMode: "unique-physical-instance", samePayload: true },
  { id: "batch-continuous", category: "batch", batchMode: "continuous" },
  { id: "stress-16-moving", category: "stress" },
  { id: "stress-frame-drops", category: "stress" },
  { id: "stress-decoder-misses", category: "stress" },
  { id: "stress-camera-motion", category: "stress" },
  { id: "stress-empty-ground-truth-transient-noise", category: "stress" },
  { id: "stress-truth-with-transient-noise", category: "stress" },
  { id: "stress-repeated-spatial-noise", category: "stress" },
] as const;

export const TRACKING_SEMANTIC_CONTRACT_SHA256 = "471f015df54522edafd4a6b80d15e3d8a165ffc14bb974aef41cca978472ee15";
export const TRACKING_EXECUTABLE_SEMANTICS_SHA256 = "320537c5a3bd759d267ec8be36188e64ace3276a9d4c7ba7104a6bfbfea9d679";

export function serializeTrackingSemanticContract(): string {
  return JSON.stringify({
    version: TRACKING_SEMANTIC_CONTRACT_VERSION,
    scenarios: TRACKING_SEMANTIC_SCENARIOS,
  });
}

/** Bind stimuli, independent Ground Truth, expectations, and tracker limits. */
export function serializeTrackingExecutableSemantics(scenarios: readonly TrackingSequenceScenario[]): string {
  return JSON.stringify(scenarios.map((scenario) => ({
    id: scenario.id,
    category: scenario.category,
    description: scenario.description,
    observationFrames: scenario.observationFrames,
    groundTruthTracks: scenario.groundTruthTracks,
    expected: scenario.expected,
    trackerOptions: scenario.trackerOptions ?? null,
  })));
}

export const REQUIRED_TRACKING_SCENARIO_IDS = TRACKING_SEMANTIC_SCENARIOS.map(({ id }) => id);
export const REQUIRED_SAME_PAYLOAD_SCENARIO_IDS = TRACKING_SEMANTIC_SCENARIOS
  .filter((entry) => "samePayload" in entry && entry.samePayload)
  .map(({ id }) => id);
export const REQUIRED_BATCH_SCENARIOS_BY_MODE = Object.freeze({
  continuous: TRACKING_SEMANTIC_SCENARIOS.filter((entry) => "batchMode" in entry && entry.batchMode === "continuous").map(({ id }) => id),
  "expected-count": TRACKING_SEMANTIC_SCENARIOS.filter((entry) => "batchMode" in entry && entry.batchMode === "expected-count").map(({ id }) => id),
  checklist: TRACKING_SEMANTIC_SCENARIOS.filter((entry) => "batchMode" in entry && entry.batchMode === "checklist").map(({ id }) => id),
  "unique-physical-instance": TRACKING_SEMANTIC_SCENARIOS.filter((entry) => "batchMode" in entry && entry.batchMode === "unique-physical-instance").map(({ id }) => id),
});
import type { TrackingSequenceScenario } from "./types.js";
