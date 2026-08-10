import { expect, test } from "@playwright/test";
import { expectCleanTrackingEvidence, loadTrackingRuntimeReport, mappingsFor } from "./tracking-runtime-test-helpers";

test("BatchController completes expected-count from three confirmed physical tracks", async ({ page }) => {
  const report = await loadTrackingRuntimeReport(page, "expected-count-batch");

  expect(report.scenario).toBe("expected-count-batch");
  expectCleanTrackingEvidence(report);
  expect(report.frames.map(({ batch }) => batch?.status)).toEqual(["collecting", "collecting", "collecting", "complete"]);
  expect(report.frames.map(({ batch }) => batch?.confirmedPhysicalInstanceCount)).toEqual([0, 2, 2, 3]);
  expect(report.frames.slice(0, 3).every(({ batch }) => batch?.status !== "complete")).toBe(true);

  const physicalInstanceIds = ["A", "B", "C"].map((objectId) => mappingsFor(report, objectId).at(-1)?.physicalInstanceId);
  expect(physicalInstanceIds).not.toContain(undefined);
  expect(new Set(physicalInstanceIds).size).toBe(3);
  expect(report.batch?.state).toMatchObject({ status: "complete", expectedCount: 3, confirmedPhysicalInstanceCount: 3 });
  expect(report.batch?.statistics).toMatchObject({
    confirmedPhysicalInstanceCount: 3,
    batchCompletedEvents: 1,
    completionAccuracy: 1,
  });
  expect(report.batch?.events.filter(({ type }) => type === "batch-completed")).toHaveLength(1);
});
