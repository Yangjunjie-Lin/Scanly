import { expect, test } from "@playwright/test";
import { expectCleanTrackingEvidence, loadTrackingRuntimeReport, mappingsFor } from "./tracking-runtime-test-helpers";

test("BarcodeTracker has zero identity switches when same-payload paths cross", async ({ page }) => {
  const report = await loadTrackingRuntimeReport(page, "same-payload-crossing");

  expect(report.scenario).toBe("same-payload-crossing");
  expectCleanTrackingEvidence(report);
  const objectA = mappingsFor(report, "A");
  const objectB = mappingsFor(report, "B");
  expect(objectA.map(({ x }) => x)).toEqual([0, 20, 45, 70]);
  expect(objectB.map(({ x }) => x)).toEqual([100, 80, 55, 30]);
  expect(new Set(objectA.map(({ trackId }) => trackId)).size).toBe(1);
  expect(new Set(objectB.map(({ trackId }) => trackId)).size).toBe(1);
  expect(objectA[0]?.trackId).not.toBe(objectB[0]?.trackId);
  expect(report.trackingStatistics).toMatchObject({ createdTrackCount: 2, matchedObservationCount: 6 });
});
