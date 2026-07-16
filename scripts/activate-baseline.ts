import fs from "node:fs";
import path from "node:path";
import type { BenchmarkFixture, BenchmarkRunSummary } from "@scanly/benchmark";
import { loadBaselineRegistry, validateBaselineForActivation } from "./baseline-registry.js";
import { computeDatasetHash } from "./benchmark-provenance.js";

const root = path.resolve(__dirname, "..");
const registryPath = path.join(root, "benchmark-results", "baselines", "registry.json");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1];
const family = value("family"); const profile = value("profile"); const file = value("file");
if (!process.argv.includes("--approve-activation") || !family || !profile || !file) throw new Error("Activation requires --approve-activation, --family, --profile, and --file.");
if (!/^node\d+-(win32|linux|darwin)-(x64|arm64)$/.test(family) || !["fast", "balanced", "robust"].includes(profile) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]+\.json$/.test(file)) throw new Error("Baseline activation arguments are invalid.");
const baselinePath = path.join(path.dirname(registryPath), file);
if (!fs.existsSync(baselinePath)) throw new Error(`Cannot activate missing baseline '${file}'.`);
const manifestPath = path.join(root, "fixtures", "manifest.json");
const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as { fixtures: BenchmarkFixture[] };
const datasetHash = await computeDatasetHash(manifestPath, manifest.fixtures.map((fixture) => fixture.file), root);
const sdkVersion = (JSON.parse(await fs.promises.readFile(path.join(root, "package.json"), "utf8")) as { version: string }).version;
const baseline = JSON.parse(await fs.promises.readFile(baselinePath, "utf8")) as Partial<BenchmarkRunSummary>;
const failures = validateBaselineForActivation(baseline, {
  sdkVersion,
  fixtureCount: manifest.fixtures.length,
  datasetHash,
  profile: profile as "fast" | "balanced" | "robust",
  runtimeFamily: family,
});
if (failures.length) throw new Error(`Baseline activation policy failed:\n- ${failures.join("\n- ")}`);
const registry = await loadBaselineRegistry(registryPath);
registry.activeBaselines[family] ??= {} as never;
registry.activeBaselines[family][profile as "fast" | "balanced" | "robust"] = file;
await fs.promises.writeFile(registryPath, JSON.stringify(registry, null, 2) + "\n");
console.log(`Activated ${file} for ${family}/${profile}.`);
