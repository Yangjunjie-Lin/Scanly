import { expect, test } from "@playwright/test";
import { loadScannerRuntimeReport } from "./scanner-runtime-test-helpers";

interface BackpressureReport {
  scenario: "backpressure";
  frameCount: number;
  expectedLatestFrameId: string;
  decodedFrameIds: string[];
  disposedFrameIds: string[];
  decoderPeakActiveCount: number;
  statistics: {
    capturedFrames: number;
    admittedFrames: number;
    droppedFrames: number;
    peakPendingFrameCount: number;
    activeDecodeCount: number;
    pendingFrameCount: number;
    staleEvents: number;
    finalControlledMemory: number;
  };
}

test("slow decode keeps one active task, drops replaced frames, and retains only the latest pending frame", async ({ page }) => {
  const report = await loadScannerRuntimeReport<BackpressureReport>(page, "backpressure");

  expect(report.scenario).toBe("backpressure");
  expect(report.statistics.capturedFrames).toBe(report.frameCount);
  expect(report.decoderPeakActiveCount).toBe(1);
  expect(report.statistics.peakPendingFrameCount).toBe(1);
  expect(report.statistics.droppedFrames).toBeGreaterThan(0);
  expect(report.statistics.admittedFrames).toBe(2);
  expect(report.statistics.droppedFrames).toBe(report.frameCount - report.statistics.admittedFrames);
  expect(report.decodedFrameIds).toEqual(["backpressure-0", report.expectedLatestFrameId]);
  expect(report.decodedFrameIds.at(-1)).toBe(report.expectedLatestFrameId);
  expect(report.disposedFrameIds).toHaveLength(report.frameCount);
  expect(new Set(report.disposedFrameIds).size).toBe(report.frameCount);
  expect(report.statistics.activeDecodeCount).toBe(0);
  expect(report.statistics.pendingFrameCount).toBe(0);
  expect(report.statistics.staleEvents).toBe(0);
  expect(report.statistics.finalControlledMemory).toBe(0);
});
