import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PUBLIC_BARCODE_FORMATS, SDK_VERSION } from "@scanly/core";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { loadNormalizedFrameFromPath } from "@scanly/node";
import {
  EXTERNAL_GROUND_TRUTH_INDEPENDENCE_STATEMENT,
  EXTERNAL_GROUND_TRUTH_REGISTRY_PATH,
  deduplicateExternalSemanticResults,
  deriveExternalPhotoGate,
  diffExternalResultMultiset,
  validateExternalFixture,
  validateExternalFixtureSet,
  validateExternalGroundTruthRegistry,
  type ExternalFixture,
  type ExternalGroundTruthRegistry,
  type ExternalRequiredResult,
  type ExternalVerificationResult,
} from "./external-open-license-contract";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "fixtures", "alpha5", "external-open-license", "manifest.json");
const GROUND_TRUTH_REGISTRY_PATH = path.join(ROOT, ...EXTERNAL_GROUND_TRUTH_REGISTRY_PATH.split("/"));
const PROJECT_PHOTO_MANIFEST_PATH = path.join(ROOT, "fixtures", "alpha5", "project-photos", "manifest.json");

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

async function main(): Promise<void> {
  const manifestBytes = fs.readFileSync(MANIFEST_PATH);
  const manifestText = manifestBytes.toString("utf8");
  const manifest = JSON.parse(manifestText) as { groundTruthRegistry: string; fixtures: ExternalFixture[] };
  if (manifest.groundTruthRegistry !== EXTERNAL_GROUND_TRUTH_REGISTRY_PATH) {
    throw new Error(`External manifest must reference ${EXTERNAL_GROUND_TRUTH_REGISTRY_PATH}`);
  }
  const groundTruthRegistryText = fs.readFileSync(GROUND_TRUTH_REGISTRY_PATH, "utf8");
  const groundTruthRegistry = JSON.parse(groundTruthRegistryText) as ExternalGroundTruthRegistry;
  validateExternalFixtureSet(manifest.fixtures);
  validateExternalGroundTruthRegistry(manifest.fixtures, groundTruthRegistry);
  const projectPhotoManifest = JSON.parse(fs.readFileSync(PROJECT_PHOTO_MANIFEST_PATH, "utf8")) as { fixtures?: Array<{ sourceType?: string }> };
  const projectOwnedRealPhotos = (projectPhotoManifest.fixtures ?? []).filter((fixture) => fixture.sourceType === "project-photo").length;
  const sourceIdentity = {
    commitSha: git("rev-parse", "HEAD"),
    treeSha: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
  };
  const engine = createZxingCppWasmEngine();
  const results: FixtureVerificationResult[] = [];
  await engine.initialize();
  try {
    for (const fixture of manifest.fixtures) {
      validateExternalFixture(fixture);
      const absolute = path.join(ROOT, fixture.file);
      if (!fs.existsSync(absolute)) throw new Error(`${fixture.id}: original file is missing`);
      const bytes = fs.readFileSync(absolute);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== fixture.sha256) throw new Error(`${fixture.id}: SHA-256 mismatch`);
      if (bytes.byteLength !== fixture.originalByteLength) throw new Error(`${fixture.id}: originalByteLength mismatch`);
      const frame = await loadNormalizedFrameFromPath(absolute, fixture.id);
      if (frame.width !== fixture.originalWidth || frame.height !== fixture.originalHeight) {
        throw new Error(`${fixture.id}: original dimensions mismatch`);
      }
      const started = performance.now();
      const outcome = await engine.decode(frame, { formats: [...PUBLIC_BARCODE_FORMATS], findMultiple: true });
      const elapsedMs = performance.now() - started;
      const actual = outcome.ok
        ? deduplicateExternalSemanticResults(outcome.results.map((result) => ({
          format: result.format,
          payload: result.text,
          isGs1: result.isGs1 === true,
        })))
        : [];
      const diff = diffExternalResultMultiset(fixture.requiredResults, actual);
      const exactMatch = diff.missing.length === 0 && diff.unexpected.length === 0;
      const correctnessPassed = diff.unexpected.length === 0;
      results.push({
        id: fixture.id,
        sha256,
        width: frame.width,
        height: frame.height,
        byteLength: bytes.byteLength,
        elapsedMs,
        expectedOutcome: fixture.expectedOutcome,
        expectedResultCount: fixture.expectedResultCount,
        requiredResults: fixture.requiredResults,
        groundTruthReview: fixture.groundTruthReview,
        physicalInstanceCount: fixture.physicalInstanceCount,
        physicalInstances: fixture.physicalInstances,
        semanticResultPolicy: fixture.semanticResultPolicy,
        expectedFormat: fixture.expectedFormat,
        expectedPayload: fixture.expectedPayload,
        expectedGs1: fixture.expectedGs1 ?? false,
        actualResults: actual,
        missingResults: diff.missing,
        unexpectedResults: diff.unexpected,
        payloadVerificationStatus: fixture.payloadVerificationStatus,
        exactMatch,
        correctnessPassed,
        // A miss is represented by aggregate recall. Per-photo failure is
        // reserved for a wrong or additional public result.
        passed: correctnessPassed,
      });
    }
  } finally {
    await engine.dispose();
  }

  const latencies = results.map((result) => result.elapsedMs as number);
  const fixtureCount = results.length;
  const requiredResultCount = results.reduce((count, result) => count + result.requiredResults.length, 0);
  const missingResultCount = results.reduce((count, result) => count + result.missingResults.length, 0);
  const exactResultCount = requiredResultCount - missingResultCount;
  const visiblePhysicalInstanceCount = results.reduce((count, result) => count + Number(result.physicalInstanceCount), 0);
  const observedResultCount = results.reduce((count, result) => count + result.actualResults.length, 0);
  const gateEvidence = deriveExternalPhotoGate(manifest.fixtures, results);
  const externalOpenLicenseGate = gateEvidence.pass;
  const report = {
    schemaVersion: "2.2-beta1-curated-open-license-photo-report",
    generatedAt: new Date().toISOString(),
    manifestSha256: crypto.createHash("sha256").update(manifestText.replaceAll("\r\n", "\n")).digest("hex"),
    groundTruthRegistrySha256: crypto.createHash("sha256").update(groundTruthRegistryText.replaceAll("\r\n", "\n")).digest("hex"),
    groundTruthAudit: {
      registryPath: EXTERNAL_GROUND_TRUTH_REGISTRY_PATH,
      fixtureCount: groundTruthRegistry.records.length,
      complete: true,
      decoderIndependent: true,
      independenceStatement: EXTERNAL_GROUND_TRUTH_INDEPENDENCE_STATEMENT,
    },
    sourceIdentity,
    sdkVersion: SDK_VERSION,
    engine: { id: engine.id, version: engine.version },
    status: externalOpenLicenseGate ? "PASS_CURATED_OPEN_LICENSE_CAMERA_PHOTOS" : "FAIL_CURATED_OPEN_LICENSE_CAMERA_PHOTOS",
    fixtureCount,
    requiredResultCount,
    exactResultCount,
    visiblePhysicalInstanceCount,
    observedResultCount,
    semanticRecall: gateEvidence.overallSemanticRecall,
    familyEvidence: gateEvidence.families,
    formatMisclassificationCount: gateEvidence.formatMisclassificationCount,
    gs1MisclassificationCount: gateEvidence.gs1MisclassificationCount,
    falsePositiveCount: gateEvidence.unexpectedResultCount,
    projectOwnedEvidence: { count: projectOwnedRealPhotos, role: "informational-only" },
    externalOpenLicenseCorpusCount: fixtureCount,
    externalOpenLicenseGate,
    curatedOpenLicenseCameraPhotoGate: gateEvidence,
    physicalDeviceEvidence: "unavailable",
    beta1Release: "NO_GO",
    averageLatencyMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
    medianLatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    results,
  };
  const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
  if (outputArgument) {
    const output = path.resolve(outputArgument.slice("--output=".length));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Verified ${fixtureCount} curated open-license camera photographs, ${visiblePhysicalInstanceCount} visible instances, and ${exactResultCount}/${requiredResultCount} semantic results; externalOpenLicenseGate=${externalOpenLicenseGate}; physicalDeviceEvidence=unavailable; beta1Release=NO_GO; projectOwnedRealPhotos=${projectOwnedRealPhotos} (informational only).`);
  if (process.argv.includes("--gate") && !externalOpenLicenseGate) {
    throw new Error(`Curated open-license camera-photo gate failed: ${gateEvidence.failureReasons.join("; ")}.`);
  }
}

interface FixtureVerificationResult extends ExternalVerificationResult {
  sha256: string;
  width: number;
  height: number;
  byteLength: number;
  elapsedMs: number;
  expectedOutcome: ExternalFixture["expectedOutcome"];
  expectedResultCount: number;
  groundTruthReview: ExternalFixture["groundTruthReview"];
  physicalInstanceCount: number;
  physicalInstances: ExternalFixture["physicalInstances"];
  semanticResultPolicy: ExternalFixture["semanticResultPolicy"];
  expectedFormat: ExternalFixture["expectedFormat"];
  expectedPayload: string | null;
  expectedGs1: boolean;
  actualResults: ExternalRequiredResult[];
  payloadVerificationStatus: ExternalFixture["payloadVerificationStatus"];
  exactMatch: boolean;
  correctnessPassed: boolean;
  passed: boolean;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
