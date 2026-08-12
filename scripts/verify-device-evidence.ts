import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import crypto from "node:crypto";

const root = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const Ajv = require("ajv/dist/2020").default as new (options?: object) => { compile(schema: object): ((value: unknown) => boolean) & { errors?: unknown[] } };
const addFormats = require("ajv-formats").default as (ajv: object) => void;

type Json = Record<string, any>;
const read = (file: string): Json => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const git = (...args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const existsCommit = (sha: string): boolean => {
  try { return git("cat-file", "-t", sha) === "commit"; } catch { return false; }
};

const schema = read("device-evidence/schema.json");
const manifest = read("device-lab/manifest.json");
const truth = read("device-lab/test-targets/ground-truth.json");
const status = read("device-evidence/status.json");
const ajv = new Ajv({ allErrors: true, strict: false }); addFormats(ajv);
const validate = ajv.compile(schema);

if (manifest.schemaVersion !== "beta4-device-manifest-1" || manifest.status !== "DEVICE_MATRIX_PARTIAL") throw new Error("Device manifest identity/status failed.");
if (manifest.groundTruthPolicy !== "decoder-independent-fixed-before-scan" || manifest.scenarios.length !== 13) throw new Error("Device protocol scenario set is incomplete.");
if (truth.schemaVersion !== "beta4-ground-truth-1" || truth.createdBeforeScanning !== true || truth.decoderGeneratedGroundTruth !== false) throw new Error("Ground Truth provenance failed.");
const targets = new Map<string, Json>();
for (const target of truth.targets as Json[]) {
  if (targets.has(target.targetId)) throw new Error(`Duplicate Ground Truth target '${target.targetId}'.`);
  if (!target.payload || !target.format || !target.creationSource || !target.medium || !target.file) throw new Error(`Incomplete Ground Truth target '${target.targetId}'.`);
  targets.set(target.targetId, target);
}
for (const scenario of manifest.scenarios as Json[]) for (const targetId of scenario.targetIds ?? []) if (!targets.has(targetId)) throw new Error(`${scenario.id}: unknown Ground Truth target '${targetId}'.`);

const hashManifest = read("device-lab/test-targets/sha256.json");
for (const [relative, expected] of Object.entries(hashManifest.hashes as Record<string, string>)) {
  const bytes = fs.readFileSync(path.join(root, ...relative.split("/")));
  const actual = crypto.createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) throw new Error(`Target SHA-256 mismatch: ${relative}`);
}

const sessionDirectory = path.join(root, "device-evidence", "sessions");
const sessionFiles = fs.readdirSync(sessionDirectory).filter((name) => name.endsWith(".json")).sort();
const counts = { "physical-mobile": 0, "remote-physical-device": 0, "desktop-camera": 0, simulated: 0 };
const evidenceIds = new Set<string>();
for (const name of sessionFiles) {
  const evidence = JSON.parse(fs.readFileSync(path.join(sessionDirectory, name), "utf8")) as Json;
  if (!validate(evidence)) throw new Error(`${name}: schema validation failed: ${JSON.stringify(validate.errors)}`);
  if (evidenceIds.has(evidence.evidenceId)) throw new Error(`${name}: duplicate evidenceId '${evidence.evidenceId}'.`);
  evidenceIds.add(evidence.evidenceId); counts[evidence.evidenceType as keyof typeof counts] += 1;
  if (!existsCommit(evidence.sourceCommit)) throw new Error(`${name}: sourceCommit is not a repository commit.`);
  if (git("show", "-s", "--format=%T", evidence.sourceCommit) !== evidence.sourceTree) throw new Error(`${name}: sourceTree does not match sourceCommit.`);
  if (evidence.repositoryDirty !== false) throw new Error(`${name}: dirty repository evidence is not admissible.`);

  const expectedAccess: Record<string, string> = {
    simulated: "simulated", "desktop-camera": "desktop-local", "physical-mobile": "physical-local", "remote-physical-device": "remote-device-farm",
  };
  if (evidence.session.hardwareAccess !== expectedAccess[evidence.evidenceType]) throw new Error(`${name}: evidenceType/hardwareAccess mismatch.`);
  if (["physical-mobile", "remote-physical-device"].includes(evidence.evidenceType)) {
    if (!evidence.device.declaredModel || !evidence.device.manufacturer || !evidence.device.operatingSystemVersion) throw new Error(`${name}: physical hardware metadata is incomplete.`);
    for (const field of ["device.declaredModel", "device.manufacturer", "device.operatingSystem", "browser.name", "browser.version", "browser.userAgent", "camera.settings", "camera.capabilities", "camera.constraints"]) {
      if (!evidence.fieldSources[field]) throw new Error(`${name}: missing field source '${field}'.`);
    }
  }

  for (const scenario of evidence.scenarios as Json[]) {
    if (scenario.falseConfirmedScans !== 0 && scenario.status === "passed") throw new Error(`${name}/${scenario.scenarioId}: PASS cannot hide false confirmations.`);
    if (scenario.status === "passed" && scenario.scenarioId !== "N1") {
      if (scenario.targetIds.length === 0 || scenario.groundTruth.length !== scenario.targetIds.length) throw new Error(`${name}/${scenario.scenarioId}: PASS requires one Ground Truth comparison per target.`);
      if (!scenario.groundTruth.every((comparison: Json) => comparison.matched === true)) throw new Error(`${name}/${scenario.scenarioId}: PASS requires every target to match fixed Ground Truth.`);
    }
    if (scenario.status === "passed" && scenario.scenarioId === "N1" && (scenario.targetIds.length !== 0 || scenario.groundTruth.length !== 0)) throw new Error(`${name}/N1: negative PASS must not manufacture positive Ground Truth comparisons.`);
    for (const comparison of scenario.groundTruth as Json[]) {
      const fixed = targets.get(comparison.targetId);
      if (!fixed || fixed.payload !== comparison.expectedPayload || fixed.format !== comparison.expectedFormat) throw new Error(`${name}/${scenario.scenarioId}: Ground Truth was altered.`);
      const actualMatch = comparison.observedPayload === comparison.expectedPayload && comparison.observedFormat === comparison.expectedFormat;
      if (comparison.matched !== actualMatch) throw new Error(`${name}/${scenario.scenarioId}: result consistency failed.`);
    }
    if (scenario.scenarioId === "P10" && scenario.status === "passed") {
      const instances = new Set(scenario.groundTruth.map((comparison: Json) => comparison.physicalInstanceId));
      if (instances.size !== scenario.targetIds.length || instances.has(undefined) || instances.has("")) throw new Error(`${name}/P10: same-payload physical instances require distinct physicalInstanceId values.`);
    }
  }
  if (evidence.longRun) {
    if (evidence.longRun.windows.map((entry: Json) => entry.label).join("|") !== "first-5-min|middle-5-min|last-5-min") throw new Error(`${name}: performance drift windows are incomplete.`);
    if (evidence.longRun.falseConfirmations !== 0 || evidence.longRun.stalePublicEvents !== 0 || evidence.longRun.finalControlledResources !== 0) throw new Error(`${name}: long-run correctness/resource gate failed.`);
  }
  if (evidence.networkIsolation.barcodePixelsUploaded !== false || evidence.networkIsolation.barcodePayloadUploaded !== false) throw new Error(`${name}: local-only privacy contract failed.`);
}

for (const [type, count] of Object.entries(counts)) {
  const key = `${type.replace(/-([a-z])/g, (_: string, letter: string) => letter.toUpperCase())}SessionCount`;
  if (status[key] !== count) throw new Error(`status.json ${key}=${status[key]} but verified count=${count}.`);
}
if (counts["physical-mobile"] + counts["remote-physical-device"] === 0) {
  if (status.physicalValidationStatus !== "PHYSICAL_DEVICE_VALIDATION_PENDING" || status.requiredGaps.length === 0) throw new Error("Zero physical evidence must remain explicitly pending with documented gaps.");
}

console.log(`Device evidence verification passed: ${sessionFiles.length} sessions (${JSON.stringify(counts)}), ${targets.size} fixed targets, no fabricated physical status.`);
