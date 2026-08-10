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
      peakTrackMapSize: 16,
      peakLostTrackCount: 0,
      peakPendingObservationCount: 0,
      peakROIState: 16,
      eventHistorySize: 0,
      finalActiveTrackCount: 0,
      finalLostTrackCount: 0,
      finalPendingObservationCount: 0,
      finalROIState: 0,
      finalControlledMemory: 0,
    });
    expect(Number(report.observed.peakAssociationPairs)).toBeLessThanOrEqual(256);
    expect(Number(report.observed.fullFrameRecoveryCount)).toBeGreaterThanOrEqual(1_000);
  }, 60_000);
});
