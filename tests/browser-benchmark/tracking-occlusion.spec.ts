import { expect, test } from "@playwright/test";
import { expectCleanTrackingEvidence, loadTrackingRuntimeReport, mappingsFor, recordTrackingRuntimeReport } from "./tracking-runtime-test-helpers";

test("BarcodeTracker restores the same identity after bounded occlusion", async ({ page }, testInfo) => {
  const report = await loadTrackingRuntimeReport(page, "bounded-occlusion");

  expect(report.scenario).toBe("bounded-occlusion");
  expectCleanTrackingEvidence(report);
  const objectA = mappingsFor(report, "A");
  expect(objectA.map(({ frameId }) => frameId)).toEqual([1, 2, 5]);
  expect(new Set(objectA.map(({ trackId }) => trackId)).size).toBe(1);
  expect(new Set(objectA.map(({ physicalInstanceId }) => physicalInstanceId)).size).toBe(1);

  const trackId = objectA[0]?.trackId;
  const stateTimeline = report.frames.map(({ tracks }) => tracks.find((track) => track.trackId === trackId)?.state);
  expect(stateTimeline).toEqual(["tentative", "confirmed", "lost", "lost", "confirmed"]);
  expect(report.frames[4]?.restoredTrackIds).toEqual([trackId]);
  expect(report.trackingStatistics).toMatchObject({
    createdTrackCount: 1,
    confirmedTrackCount: 1,
    restoredTrackCount: 1,
    retiredTrackCount: 0,
  });
  recordTrackingRuntimeReport(report, testInfo.project.name);
});
