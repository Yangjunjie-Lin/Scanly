import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary } from "@scanly/benchmark";
import { readCanonicalEvidence, PROFILE_KEYS, type ProfileKey } from "./canonical-evidence.js";
import { runtimeFamily, validateBaselineForActivation } from "./baseline-registry.js";

const ROOT = path.resolve(__dirname, "..");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const profile = value("profile") as ProfileKey | undefined;
const baselineId = value("baseline-id");
const manifestPath = value("canonical-manifest");
if (!process.argv.includes("--approve-baseline") || !profile || !PROFILE_KEYS.includes(profile) || !baselineId || !/^v2-alpha3-r\d+$/.test(baselineId) || !manifestPath) {
  throw new Error("Baseline freeze requires --profile=fast|balanced|robust, --baseline-id=v2-alpha3-rN, --canonical-manifest=<path>, and --approve-baseline.");
}
const bundle = readCanonicalEvidence(manifestPath);
const report = bundle.reports[profile];
const family = runtimeFamily(report.runtime.nodeVersion, report.runtime.platform as NodeJS.Platform, report.runtime.arch as NodeJS.Architecture);
const failures = validateBaselineForActivation(report, {
  sdkVersion: bundle.manifest.sdkVersion,
  fixtureCount: bundle.manifest.fixtureCount,
  datasetHash: bundle.manifest.sourceIdentity.datasetHash,
  profile,
  runtimeFamily: family,
});
if (failures.length) throw new Error(`Baseline freeze policy failed:\n- ${failures.join("\n- ")}`);
const fileName = `${baselineId}-${profile}-${family.replace("win32", "windows")}.json`;
const destination = path.join(ROOT, "benchmark-results", "baselines", fileName);
const baseline: BenchmarkRunSummary & { evidenceId: string; canonicalManifestHash: string; reportHash: string; passedIds: string[] } = {
  ...report,
  executionPolicy: { ...report.executionPolicy, evidenceType: "baseline-candidate" },
  evidenceId: bundle.manifest.evidenceId,
  canonicalManifestHash: bundle.manifest.manifestHash,
  reportHash: bundle.manifest.reportHashes[profile],
  passedIds: report.results.filter((result) => result.pass).map((result) => result.id),
};
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, JSON.stringify(baseline, null, 2) + "\n", { flag: "wx" });
console.log(`Frozen immutable baseline ${destination}`);
