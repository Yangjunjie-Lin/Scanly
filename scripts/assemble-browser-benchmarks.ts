import fs from "node:fs";
import path from "node:path";
import type { BrowserBenchmarkReport } from "@scanly/benchmark";
import { sha256, stableJson } from "./benchmark-provenance.js";

const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const directory = path.resolve(value("directory") ?? "benchmark-results/browser");
const output = path.resolve(value("output") ?? path.join(directory, "browser-evidence-manifest.json"));
const find = (root: string, name: string): string | undefined => fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? [find(path.join(root, entry.name), name)] : [entry.name === name ? path.join(root, entry.name) : undefined]).find(Boolean);
const reports = Object.fromEntries((["chromium", "firefox", "webkit"] as const).map((browser) => {
  const file = find(directory, `${browser}.json`);
  if (!file) throw new Error(`Missing ${browser} browser benchmark report.`);
  return [browser, { file, report: JSON.parse(fs.readFileSync(file, "utf8")) as BrowserBenchmarkReport }];
}));
type BrowserTrackingArtifact = {
  schemaVersion: string;
  browser: string;
  sourceIdentity: { commitSha: string; treeSha: string; repositoryDirty: boolean; sdkVersion: string };
  expectedScenarioIds: string[];
  scenarioCount: number;
  scenarios: Array<{ id: string; pass: boolean }>;
  pass: boolean;
};
const trackingReports = Object.fromEntries((["chromium", "firefox", "webkit"] as const).map((browser) => {
  const file = find(directory, `tracking-${browser}.json`);
  if (!file) throw new Error(`Missing ${browser} browser tracking report.`);
  return [browser, { file, report: JSON.parse(fs.readFileSync(file, "utf8")) as BrowserTrackingArtifact }];
}));
const identities = Object.values(reports).map(({ report }) => ({ commitSha: report.sourceIdentity.commitSha, treeSha: report.sourceIdentity.treeSha, sdkVersion: report.sourceIdentity.sdkVersion, datasetHash: report.sourceIdentity.datasetHash, scenarioHash: report.sourceIdentity.scenarioHash, wasmBuildHash: report.sourceIdentity.wasmBuildHash, fixtureIds: report.sourceIdentity.fixtureIds }));
if (new Set(identities.map((identity) => stableJson(identity))).size !== 1) throw new Error("Browser reports do not share source identity and fixture set.");
for (const [browser, { report }] of Object.entries(reports)) {
  const failedFixtures = report.results.filter((result) => !result.pass).map((result) => result.fixtureId);
  const allowedDocumentedFullFailure = report.benchmarkKind === "full"
    && failedFixtures.length === 1
    && failedFixtures[0] === "14-damaged";
  if (failedFixtures.length && !allowedDocumentedFullFailure) throw new Error(`${browser} browser suite contains failed fixtures: ${failedFixtures.join(", ")}.`);
  if (report.falsePositiveCount !== 0) throw new Error(`${browser} browser suite contains false positives.`);
  if (report.metadata.actualDecodePath === "unknown") throw new Error(`${browser} browser suite did not record an actual decode path.`);
  if (report.metadata.workerAvailable && report.metadata.workerCreatedCount < 1) throw new Error(`${browser} reported Worker support without Worker creation.`);
  if (report.fixtureCount !== report.sourceIdentity.fixtureIds.length) throw new Error(`${browser} fixture count is inconsistent.`);
}
const requiredTrackingScenarios = ["single-target", "same-payload-two-targets", "same-payload-crossing", "bounded-occlusion", "expected-count-batch"].sort();
for (const [browser, { report }] of Object.entries(trackingReports)) {
  const decodeIdentity = reports[browser]?.report.sourceIdentity;
  const observedIds = report.scenarios.map(({ id }) => id).sort();
  if (report.schemaVersion !== "2.3-beta2-browser-tracking" || report.browser !== browser) throw new Error(`${browser} browser tracking schema/identity failed.`);
  if (!decodeIdentity || report.sourceIdentity.commitSha !== decodeIdentity.commitSha || report.sourceIdentity.treeSha !== decodeIdentity.treeSha || report.sourceIdentity.sdkVersion !== decodeIdentity.sdkVersion || report.sourceIdentity.repositoryDirty) {
    throw new Error(`${browser} browser tracking report is not from the clean decode-report source identity.`);
  }
  if (stableJson([...report.expectedScenarioIds].sort()) !== stableJson(requiredTrackingScenarios) || stableJson(observedIds) !== stableJson(requiredTrackingScenarios)) {
    throw new Error(`${browser} browser tracking report does not contain the required scenario set.`);
  }
  if (!report.pass || report.scenarioCount !== requiredTrackingScenarios.length || !report.scenarios.every(({ pass }) => pass)) {
    throw new Error(`${browser} browser tracking scenario gate failed.`);
  }
}
const manifest = {
  schemaVersion: "1.1-beta2",
  sourceIdentity: identities[0],
  suite: Object.values(reports)[0].report.benchmarkKind,
  reports: Object.fromEntries(Object.entries(reports).map(([browser, { file }]) => [browser, { file: path.basename(file), sha256: sha256(fs.readFileSync(file)) }])),
  trackingReports: Object.fromEntries(Object.entries(trackingReports).map(([browser, { file }]) => [browser, { file: path.basename(file), sha256: sha256(fs.readFileSync(file)) }])),
  trackingScenarioIds: requiredTrackingScenarios,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Assembled cross-browser ${manifest.suite} evidence: ${output}`);
