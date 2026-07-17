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
const identities = Object.values(reports).map(({ report }) => ({ commitSha: report.sourceIdentity.commitSha, treeSha: report.sourceIdentity.treeSha, sdkVersion: report.sourceIdentity.sdkVersion, datasetHash: report.sourceIdentity.datasetHash, scenarioHash: report.sourceIdentity.scenarioHash, fixtureIds: report.sourceIdentity.fixtureIds }));
if (new Set(identities.map((identity) => stableJson(identity))).size !== 1) throw new Error("Browser reports do not share source identity and fixture set.");
for (const [browser, { report }] of Object.entries(reports)) {
  if (report.results.some((result) => !result.pass)) throw new Error(`${browser} browser suite contains failed fixtures.`);
  if (report.falsePositiveCount !== 0) throw new Error(`${browser} browser suite contains false positives.`);
  if (report.metadata.actualDecodePath === "unknown") throw new Error(`${browser} browser suite did not record an actual decode path.`);
  if (report.metadata.workerAvailable && report.metadata.workerCreatedCount < 1) throw new Error(`${browser} reported Worker support without Worker creation.`);
  if (report.fixtureCount !== report.sourceIdentity.fixtureIds.length) throw new Error(`${browser} fixture count is inconsistent.`);
}
const manifest = {
  schemaVersion: "1.0",
  sourceIdentity: identities[0],
  suite: Object.values(reports)[0].report.benchmarkKind,
  reports: Object.fromEntries(Object.entries(reports).map(([browser, { file }]) => [browser, { file: path.basename(file), sha256: sha256(fs.readFileSync(file)) }])),
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Assembled cross-browser ${manifest.suite} evidence: ${output}`);
