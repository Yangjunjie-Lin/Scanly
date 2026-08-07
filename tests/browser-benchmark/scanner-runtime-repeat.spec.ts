import { expect, test } from "@playwright/test";
import { loadScannerRuntimeReport } from "./scanner-runtime-test-helpers";

interface RepeatReport {
  scenario: "repeat";
  repeatPolicy: string;
  frameCount: number;
  emittedPayloads: string[];
  emittedPhysicalInstanceIds: Array<string | undefined>;
  diagnosticEventTypes: string[];
  statistics: {
    capturedFrames: number;
    admittedFrames: number;
    confirmedEvents: number;
    emittedEvents: number;
    suppressedRepeats: number;
    staleEvents: number;
    activeDecodeCount: number;
    pendingFrameCount: number;
  };
}

test("once-per-session emits one event for fifty observations of the same barcode", async ({ page }) => {
  const report = await loadScannerRuntimeReport<RepeatReport>(page, "repeat");

  expect(report.scenario).toBe("repeat");
  expect(report.repeatPolicy).toBe("once-per-session");
  expect(report.frameCount).toBe(50);
  expect(report.statistics.capturedFrames).toBe(50);
  expect(report.statistics.admittedFrames).toBe(50);
  expect(report.statistics.confirmedEvents).toBe(1);
  expect(report.statistics.emittedEvents).toBe(1);
  expect(report.statistics.suppressedRepeats).toBe(48);
  expect(report.emittedPayloads).toEqual(["BROWSER-REPEAT"]);
  expect(report.emittedPhysicalInstanceIds).toHaveLength(1);
  expect(report.emittedPhysicalInstanceIds[0]).toBeTruthy();
  expect(report.diagnosticEventTypes.filter((type) => type === "emitted")).toHaveLength(1);
  expect(report.diagnosticEventTypes.filter((type) => type === "suppressed")).toHaveLength(48);
  expect(report.statistics.staleEvents).toBe(0);
  expect(report.statistics.activeDecodeCount).toBe(0);
  expect(report.statistics.pendingFrameCount).toBe(0);
});
