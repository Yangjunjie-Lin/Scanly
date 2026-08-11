import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

export const REQUIRED_BROWSER_TRACKING_SCENARIOS = [
  "single-target",
  "same-payload-two-targets",
  "same-payload-crossing",
  "bounded-occlusion",
  "expected-count-batch",
] as const;

interface BrowserTrackingScenarioEvidence {
  id: string;
  pass: boolean;
  report: BrowserTrackingReport;
}

interface BrowserTrackingArtifact {
  schemaVersion: "2.3-beta2-browser-tracking";
  browser: string;
  sourceIdentity: {
    commitSha: string;
    treeSha: string;
    repositoryDirty: boolean;
    sdkVersion: string;
  };
  expectedScenarioIds: readonly string[];
  scenarioCount: number;
  scenarios: BrowserTrackingScenarioEvidence[];
  pass: boolean;
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

/** Persist the browser-observed SDK report so workflow Assemble can hash and gate it. */
export function recordTrackingRuntimeReport(report: BrowserTrackingReport, browser: string): void {
  const root = process.cwd();
  const output = path.join(root, "benchmark-results", "browser", `tracking-${browser}.json`);
  const commitSha = git(root, "rev-parse", "HEAD");
  const treeSha = git(root, "rev-parse", "HEAD^{tree}");
  const sdkVersion = (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version: string }).version;
  const sourceIdentity = {
    commitSha,
    treeSha,
    repositoryDirty: git(root, "status", "--porcelain", "--untracked-files=all").length > 0,
    sdkVersion,
  };
  const existing = fs.existsSync(output)
    ? JSON.parse(fs.readFileSync(output, "utf8")) as BrowserTrackingArtifact
    : undefined;
  if (existing && (existing.sourceIdentity.commitSha !== commitSha || existing.sourceIdentity.treeSha !== treeSha || existing.browser !== browser)) {
    throw new Error(`Refusing to mix browser tracking evidence from another source in ${output}.`);
  }
  const scenarios = new Map((existing?.scenarios ?? []).map((entry) => [entry.id, entry]));
  scenarios.set(report.scenario, { id: report.scenario, pass: trackingScenarioPass(report), report });
  const ordered = [...scenarios.values()].sort((left, right) => left.id.localeCompare(right.id));
  const artifact: BrowserTrackingArtifact = {
    schemaVersion: "2.3-beta2-browser-tracking",
    browser,
    sourceIdentity,
    expectedScenarioIds: REQUIRED_BROWSER_TRACKING_SCENARIOS,
    scenarioCount: ordered.length,
    scenarios: ordered,
    pass: ordered.every((entry) => entry.pass),
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
}

function trackingScenarioPass(report: BrowserTrackingReport): boolean {
  const common = report.metrics.identitySwitchCount === 0
    && report.metrics.trackFragmentationCount === 0
    && report.metrics.falseTrackCount === 0
    && report.metrics.missedObservationCount === 0
    && report.metrics.trackRecall === 1
    && report.metrics.trackPrecision === 1
    && report.disposal.activeTrackCount === 0
    && report.disposal.lostTrackCount === 0
    && report.disposal.pendingObservationCount === 0;
  if (!common) return false;
  if (report.scenario !== "expected-count-batch") return true;
  return report.batch?.state.status === "complete"
    && report.batch.statistics.batchCompletedEvents === 1
    && report.batch.statistics.completionAccuracy === 1;
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
