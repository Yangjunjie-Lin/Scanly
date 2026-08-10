import { expect, type Page } from "@playwright/test";

export interface BrowserTrackSnapshot {
  trackId: string;
  physicalInstanceId: string;
  payload: string;
  format: string;
  state: "tentative" | "confirmed" | "lost" | "retired";
  observationCount: number;
  missedFrameCount: number;
  firstFrameId: number;
  lastFrameId: number;
  x: number;
  y: number;
  velocity?: { x: number; y: number };
}

export interface BrowserObjectMapping {
  frameId: number;
  objectId: string;
  trackId: string;
  physicalInstanceId: string;
  state: BrowserTrackSnapshot["state"];
  x: number;
  y: number;
}

export interface BrowserTrackingFrame {
  frameId: number;
  decoderObjectOrder: string[];
  visibleObjectIds: string[];
  mappings: BrowserObjectMapping[];
  tracks: BrowserTrackSnapshot[];
  newTrackIds: string[];
  lostTrackIds: string[];
  restoredTrackIds: string[];
  retiredTrackIds: string[];
  batch?: {
    status: string;
    confirmedPhysicalInstanceCount: number;
    matchedCount: number;
    missingQuantity: number;
    unexpectedCount: number;
    duplicateCount: number;
  };
}

export interface BrowserTrackingReport {
  scenario: string;
  browser: string;
  groundTruthObjectCount: number;
  frameCount: number;
  frames: BrowserTrackingFrame[];
  mappings: BrowserObjectMapping[];
  metrics: {
    identitySwitchCount: number;
    trackFragmentationCount: number;
    falseTrackCount: number;
    matchedObservationCount: number;
    missedObservationCount: number;
    trackRecall: number;
    trackPrecision: number;
  };
  trackingStatistics: {
    processedFrames: number;
    receivedObservations: number;
    matchedObservationCount: number;
    createdTrackCount: number;
    confirmedTrackCount: number;
    restoredTrackCount: number;
    retiredTrackCount: number;
    peakTrackCount: number;
    activeTrackCount: number;
    lostTrackCount: number;
    pendingObservationCount: number;
  };
  disposal: {
    activeTrackCount: number;
    lostTrackCount: number;
    pendingObservationCount: number;
  };
  batch?: {
    state: {
      status: string;
      expectedCount?: number;
      confirmedPhysicalInstanceCount: number;
    };
    statistics: {
      confirmedPhysicalInstanceCount: number;
      batchCompletedEvents: number;
      completionAccuracy: number;
    };
    events: Array<{ type: string; trackId?: string }>;
  };
}

export async function loadTrackingRuntimeReport(page: Page, scenario: string): Promise<BrowserTrackingReport> {
  await page.goto(`/tracking-runtime-test?scenario=${scenario}`);
  const report = page.getByTestId("tracking-runtime-report");
  await expect(report).not.toHaveText("running", { timeout: 30_000 });
  const parsed = JSON.parse(await report.innerText()) as BrowserTrackingReport & { error?: string };
  if (parsed.error) throw new Error(`Browser BarcodeTracker ${scenario} scenario failed: ${parsed.error}`);
  return parsed;
}

export function mappingsFor(report: BrowserTrackingReport, objectId: string): BrowserObjectMapping[] {
  return report.mappings.filter((mapping) => mapping.objectId === objectId);
}

export function expectCleanTrackingEvidence(report: BrowserTrackingReport): void {
  expect(report.metrics).toMatchObject({
    identitySwitchCount: 0,
    trackFragmentationCount: 0,
    falseTrackCount: 0,
    missedObservationCount: 0,
    trackRecall: 1,
    trackPrecision: 1,
  });
  expect(report.disposal).toEqual({ activeTrackCount: 0, lostTrackCount: 0, pendingObservationCount: 0 });
}
