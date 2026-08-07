import { expect, test } from "@playwright/test";
import { loadScannerRuntimeReport } from "./scanner-runtime-test-helpers";

interface LifecycleSnapshot {
  state: string;
  admittedFrames: number;
  droppedFrames: number;
  emittedEvents: number;
  staleResultsDiscarded: number;
  staleEvents: number;
  activeDecodeCount: number;
  pendingFrameCount: number;
  finalControlledMemory: number;
}

interface LifecycleReport {
  scenario: "lifecycle";
  states: string[];
  observations: Array<{ frameId: string; generation: number; abortedAtCompletion: boolean }>;
  decodedFrameIds: string[];
  emittedPayloads: string[];
  beforePause: LifecycleSnapshot;
  duringPause: LifecycleSnapshot;
  afterPausedDecodeCompletion: LifecycleSnapshot;
  afterResume: LifecycleSnapshot;
  final: LifecycleSnapshot;
  lateEventsDuringPause: number;
  lateEventsAfterStop: number;
  cancelCount: number;
  decoderPeakActiveCount: number;
}

test("ScannerSession lifecycle invalidates paused and stopped decodes without stale public events", async ({ page }) => {
  const report = await loadScannerRuntimeReport<LifecycleReport>(page, "lifecycle");

  expect(report.scenario).toBe("lifecycle");
  expect(report.states).toEqual(["idle", "starting", "scanning", "paused", "scanning", "stopping", "stopped"]);
  expect(report.decodedFrameIds).toEqual([
    "lifecycle-before-pause-0",
    "lifecycle-after-resume-0",
    "lifecycle-before-stop-0",
  ]);
  expect(report.decodedFrameIds).not.toContain("lifecycle-paused-0");

  expect(report.duringPause.state).toBe("paused");
  expect(report.duringPause.admittedFrames).toBe(report.beforePause.admittedFrames);
  expect(report.duringPause.emittedEvents).toBe(0);
  expect(report.duringPause.droppedFrames).toBeGreaterThan(report.beforePause.droppedFrames);
  expect(report.afterPausedDecodeCompletion.staleResultsDiscarded).toBe(1);
  expect(report.lateEventsDuringPause).toBe(0);

  expect(report.afterResume.state).toBe("scanning");
  expect(report.afterResume.emittedEvents).toBe(1);
  expect(report.emittedPayloads).toEqual(["LIFECYCLE-CURRENT"]);
  expect(report.observations[0]?.generation).not.toBe(report.observations[1]?.generation);
  expect(report.observations.map(({ abortedAtCompletion }) => abortedAtCompletion)).toEqual([true, false, true]);

  expect(report.final.state).toBe("stopped");
  expect(report.final.staleResultsDiscarded).toBe(2);
  expect(report.final.staleEvents).toBe(0);
  expect(report.lateEventsAfterStop).toBe(0);
  expect(report.final.activeDecodeCount).toBe(0);
  expect(report.final.pendingFrameCount).toBe(0);
  expect(report.final.finalControlledMemory).toBe(0);
  expect(report.decoderPeakActiveCount).toBe(1);
  expect(report.cancelCount).toBeGreaterThanOrEqual(2);
});
