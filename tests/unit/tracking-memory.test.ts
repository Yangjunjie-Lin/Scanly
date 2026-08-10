import { describe, expect, it } from "vitest";
import { runTrackingSoak } from "../../scripts/soak-tracking";

describe("tracking controlled-memory contract", () => {
  it("drains a 10,000-frame, 16-moving-track deterministic soak", () => {
    const report = runTrackingSoak(10_000);
    expect(report.failureReasons).toEqual([]);
    expect(report.pass).toBe(true);
    expect(report.workerEvidence).toBe("not-applicable");
    expect(report.observed).toMatchObject({
      processedFrames: 10_000,
      decoderCalls: 10_000,
      decoderCallsPerFrame: 1,
      peakTrackMapSize: 24,
      peakLostTrackCount: 8,
      peakPendingObservationCount: 0,
      peakROIState: 24,
      eventHistoryCapacity: 64,
      peakEventHistorySize: 64,
      batchStatusBeforeDispose: "collecting",
      batchMatchedQuantity: 16,
      batchMissingQuantity: 1,
      batchPeakRetainedTrackCount: 24,
      batchPeakRetainedPhysicalInstanceCount: 32,
      finalActiveTrackCount: 0,
      finalLostTrackCount: 0,
      finalPendingObservationCount: 0,
      finalROIState: 0,
      finalBatchRetainedTrackCount: 0,
      finalBatchRetainedPhysicalInstanceCount: 0,
      finalBatchUnexpectedQuantity: 0,
      finalBatchDuplicateQuantity: 0,
      finalEventHistorySize: 0,
      finalControlledMemory: 0,
    });
    expect(Number(report.observed.retiredTrackCount)).toBeGreaterThan(0);
    expect(Number(report.observed.batchUnexpectedQuantity)).toBeGreaterThan(0);
    expect(Number(report.observed.batchDuplicateQuantity)).toBeGreaterThan(0);
    expect(Number(report.observed.batchRetentionRejectedPhysicalInstanceCount)).toBeGreaterThan(0);
    expect(Number(report.observed.peakAssociationPairs)).toBeLessThanOrEqual(24 ** 2);
    expect(Number(report.observed.fullFrameRecoveryCount)).toBeGreaterThanOrEqual(1_000);
  }, 60_000);
});
