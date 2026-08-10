import { expect, test } from "@playwright/test";
import { expectCleanTrackingEvidence, loadTrackingRuntimeReport, mappingsFor, recordTrackingRuntimeReport } from "./tracking-runtime-test-helpers";

test("BarcodeTracker keeps one moving target on one confirmed physical identity", async ({ page }, testInfo) => {
  const report = await loadTrackingRuntimeReport(page, "single-target");

  expect(report.scenario).toBe("single-target");
  expect(report.groundTruthObjectCount).toBe(1);
  expect(report.frameCount).toBe(4);
  expectCleanTrackingEvidence(report);

  const objectA = mappingsFor(report, "A");
  expect(objectA).toHaveLength(4);
  expect(new Set(objectA.map(({ trackId }) => trackId)).size).toBe(1);
  expect(new Set(objectA.map(({ physicalInstanceId }) => physicalInstanceId)).size).toBe(1);
  expect(objectA.map(({ state }) => state)).toEqual(["tentative", "confirmed", "confirmed", "confirmed"]);
  expect(report.trackingStatistics).toMatchObject({
    processedFrames: 4,
    receivedObservations: 4,
    matchedObservationCount: 3,
    createdTrackCount: 1,
    confirmedTrackCount: 1,
    peakTrackCount: 1,
  });
  recordTrackingRuntimeReport(report, testInfo.project.name);
});
