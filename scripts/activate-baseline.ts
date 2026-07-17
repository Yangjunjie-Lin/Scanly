import fs from "node:fs";
import path from "node:path";
import type { BenchmarkRunSummary } from "@scanly/benchmark";
import { loadBaselineRegistry, runtimeFamily, validateBaselineForActivation } from "./baseline-registry.js";
import { PROFILE_KEYS, PROFILE_REPORT_KEYS, readCanonicalEvidence } from "./canonical-evidence.js";
import { sha256Text } from "./benchmark-provenance.js";

const ROOT = path.resolve(__dirname, "..");
const registryPath = path.join(ROOT, "benchmark-results", "baselines", "registry.json");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
async function main(): Promise<void> {
const baselineId = value("baseline-id");
const manifestPath = value("canonical-manifest");
if (!process.argv.includes("--approve-activation") || !baselineId || !/^v2-alpha3-r\d+$/.test(baselineId) || !manifestPath) {
  throw new Error("Activation requires --baseline-id=v2-alpha3-rN, --canonical-manifest=<path>, and --approve-activation.");
}
const bundle = readCanonicalEvidence(manifestPath);
const expectedFamily = "node24-win32-x64";
const files = Object.fromEntries(PROFILE_KEYS.map((profile) => [profile, `${baselineId}-${profile}-node24-windows-x64.json`])) as Record<typeof PROFILE_KEYS[number], string>;
const hashes = {} as Record<typeof PROFILE_KEYS[number], string>;
for (const profile of PROFILE_KEYS) {
  const baselinePath = path.join(path.dirname(registryPath), files[profile]);
  if (!fs.existsSync(baselinePath)) throw new Error(`Cannot activate missing baseline '${files[profile]}'.`);
  const raw = fs.readFileSync(baselinePath);
  const baseline = JSON.parse(raw.toString("utf8")) as Partial<BenchmarkRunSummary> & { evidenceId?: string; canonicalManifestHash?: string; reportHash?: string };
  const failures = validateBaselineForActivation(baseline, {
    sdkVersion: bundle.manifest.sdkVersion, fixtureCount: bundle.manifest.fixtureCount,
    datasetHash: bundle.manifest.sourceIdentity.datasetHash, profile, runtimeFamily: expectedFamily,
  });
  const actualFamily = baseline.runtime?.nodeVersion && baseline.runtime.platform && baseline.runtime.arch
    ? runtimeFamily(baseline.runtime.nodeVersion, baseline.runtime.platform as NodeJS.Platform, baseline.runtime.arch as NodeJS.Architecture) : "";
  if (actualFamily !== expectedFamily) failures.push("baseline runtime family is not Node 24 Windows x64");
  if (baseline.evidenceId !== bundle.manifest.evidenceId || baseline.canonicalManifestHash !== bundle.manifest.manifestHash || baseline.reportHash !== bundle.manifest.reportHashes[PROFILE_REPORT_KEYS[profile].json]) failures.push("baseline source evidence set is incompatible");
  if (failures.length) throw new Error(`Baseline activation policy failed for ${profile}:\n- ${failures.join("\n- ")}`);
  hashes[profile] = sha256Text(raw);
}
const registry = await loadBaselineRegistry(registryPath);
registry.schemaVersion = "2.0";
registry.activeBaselines[expectedFamily] = files;
registry.activeEvidence ??= {};
registry.activeEvidence[expectedFamily] = {
  baselineId,
  evidenceId: bundle.manifest.evidenceId,
  canonicalManifestHash: bundle.manifest.manifestHash,
  baselineHashes: hashes,
};
const temporary = `${registryPath}.${process.pid}.tmp`;
const backup = `${registryPath}.${process.pid}.bak`;
await fs.promises.writeFile(temporary, JSON.stringify(registry, null, 2) + "\n", { flag: "wx" });
let movedOriginal = false;
try {
  await fs.promises.rename(registryPath, backup);
  movedOriginal = true;
  await fs.promises.rename(temporary, registryPath);
  await fs.promises.rm(backup);
} catch (error) {
  if (movedOriginal) {
    if (fs.existsSync(registryPath)) await fs.promises.rm(registryPath);
    if (fs.existsSync(backup)) await fs.promises.rename(backup, registryPath);
  }
  if (fs.existsSync(temporary)) await fs.promises.rm(temporary);
  throw error;
}
console.log(`Activated ${baselineId} for ${expectedFamily}: ${PROFILE_KEYS.join(", ")}.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
