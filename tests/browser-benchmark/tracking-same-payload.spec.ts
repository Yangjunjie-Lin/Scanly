import { expect, test } from "@playwright/test";
import { expectCleanTrackingEvidence, loadTrackingRuntimeReport, mappingsFor } from "./tracking-runtime-test-helpers";

test("BarcodeTracker separates two same-payload physical objects while decoder order changes", async ({ page }) => {
  const report = await loadTrackingRuntimeReport(page, "same-payload-two-targets");

  expect(report.scenario).toBe("same-payload-two-targets");
  expect(report.groundTruthObjectCount).toBe(2);
  expectCleanTrackingEvidence(report);
  expect(report.frames.map(({ decoderObjectOrder }) => decoderObjectOrder)).toEqual([
    ["A", "B"], ["B", "A"], ["A", "B"], ["B", "A"],
  ]);

  const objectA = mappingsFor(report, "A");
  const objectB = mappingsFor(report, "B");
  expect(new Set(objectA.map(({ trackId }) => trackId)).size).toBe(1);
  expect(new Set(objectB.map(({ trackId }) => trackId)).size).toBe(1);
  expect(objectA[0]?.trackId).not.toBe(objectB[0]?.trackId);
  expect(objectA[0]?.physicalInstanceId).not.toBe(objectB[0]?.physicalInstanceId);
  expect(report.trackingStatistics).toMatchObject({ createdTrackCount: 2, confirmedTrackCount: 2, peakTrackCount: 2 });
});
