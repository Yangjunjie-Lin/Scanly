import { describe, expect, it } from "vitest";
import { TrackingEvaluator } from "../../benchmark/tracking/evaluator";
import { runTrackingSuite } from "../../benchmark/tracking/report";
import { TRACKING_SEQUENCE_SCENARIOS, trackingGeometry } from "../../benchmark/tracking/sequence-fixtures";
import type { GroundTruthTrack, PredictedTrackSnapshot } from "../../benchmark/tracking/types";

function predicted(trackId: string, frameIndex: number, x: number): PredictedTrackSnapshot {
  return {
    trackId,
    physicalInstanceId: `physical-${trackId}`,
    payload: "EVALUATOR",
    format: "qr_code",
    state: "confirmed",
    firstFrameId: 0,
    lastFrameId: frameIndex,
    observationCount: frameIndex + 1,
    missedFrameCount: 0,
    geometry: trackingGeometry(x, 100),
  };
}

describe("tracking benchmark ground truth", () => {
  it("contains at least 24 semantic scenarios across every required family", () => {
    expect(TRACKING_SEQUENCE_SCENARIOS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(TRACKING_SEQUENCE_SCENARIOS.map(({ category }) => category))).toEqual(new Set([
      "basic", "multi-object", "identity", "lifecycle", "batch", "stress",
    ]));
    expect(TRACKING_SEQUENCE_SCENARIOS.map(({ id }) => id).length).toBe(new Set(TRACKING_SEQUENCE_SCENARIOS.map(({ id }) => id)).size);
  });

  it("keeps decoder stimuli structurally independent from object identity truth", () => {
    for (const scenario of TRACKING_SEQUENCE_SCENARIOS) {
      expect(scenario.groundTruthTracks.every((track) => track.objectId.length > 0)).toBe(true);
      for (const frame of scenario.observationFrames) {
        for (const observation of frame.observations) {
          expect("objectId" in observation).toBe(false);
          expect(observation.observationId).not.toContain("objectId");
        }
      }
    }
  });

  it("computes identity switches, fragmentation, misses, false tracks, recall, precision, and lifetime", () => {
    const truth: GroundTruthTrack[] = [{
      objectId: "truth-a",
      payload: "EVALUATOR",
      format: "qr_code",
      frames: [0, 1, 2].map((frameIndex) => ({ frameIndex, visible: true, geometry: trackingGeometry(100 + frameIndex * 10, 100) })),
    }];
    const evaluator = new TrackingEvaluator(truth);
    evaluator.evaluateFrame(0, [predicted("track-a", 0, 100)]);
    evaluator.evaluateFrame(1, [predicted("track-b", 1, 110)]);
    evaluator.evaluateFrame(2, [predicted("false-track", 2, 500)]);
    const result = evaluator.finish();
    expect(result.metrics).toMatchObject({
      groundTruthObjectCount: 1,
      confirmedTrackCount: 3,
      identitySwitchCount: 1,
      trackFragmentationCount: 1,
      falseTrackCount: 1,
      matchedObservationCount: 2,
      missedObservationCount: 1,
      falseTrackObservationCount: 1,
    });
    expect(result.metrics.trackRecall).toBeCloseTo(2 / 3);
    expect(result.metrics.trackPrecision).toBeCloseTo(2 / 3);
    // The synthetic snapshots explicitly declare lifetimes of 1, 2, and 3 frames.
    expect(result.metrics.averageTrackLifetimeFrames).toBe(2);
  });
});

describe("tracking benchmark execution", () => {
  it("executes all semantic drivers and derives every deterministic gate from observations", async () => {
    const result = await runTrackingSuite();
    expect(result.scenarios).toHaveLength(TRACKING_SEQUENCE_SCENARIOS.length);
    expect(result.scenarios.filter(({ pass }) => !pass).map(({ id, failureReasons }) => ({ id, failureReasons }))).toEqual([]);
    expect(result.aggregateGates.filter(({ pass }) => !pass)).toEqual([]);
    expect(result.aggregateMetrics).toMatchObject({ falseTrackCount: 0, identitySwitchCount: 0, falseBatchCompletionCount: 0 });
    expect(result.aggregateMetrics.samePayloadScenarioPassCount).toBe(result.aggregateMetrics.samePayloadScenarioCount);
    expect(result.aggregateMetrics.batchScenarioPassCount).toBe(result.aggregateMetrics.batchScenarioCount);
    expect(result.pass).toBe(true);
  });

  it("records bounded 1/4/8/16 target development baselines", async () => {
    const result = await runTrackingSuite();
    expect(result.scales.map(({ targetCount }) => targetCount)).toEqual([1, 4, 8, 16]);
    for (const scale of result.scales) {
      expect(scale.decoderCalls).toBeGreaterThan(0);
      expect(scale.decoderCallsPerFrame).toBe(1);
      expect(scale.maximumAssociationPairs).toBeLessThanOrEqual(scale.targetCount ** 2);
      expect(scale.associationP50Ms).toBeGreaterThanOrEqual(0);
      expect(scale.associationP95Ms).toBeGreaterThanOrEqual(scale.associationP50Ms);
      expect(scale.trackingP95Ms).toBeGreaterThanOrEqual(scale.trackingP50Ms);
      expect(scale.effectiveFps).toBeGreaterThan(0);
    }
  });
});
