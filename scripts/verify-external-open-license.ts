import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PUBLIC_BARCODE_FORMATS, SDK_VERSION } from "@scanly/core";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { loadNormalizedFrameFromPath } from "@scanly/node";
import {
  diffExternalResultMultiset,
  isExternalFormatMisclassification,
  isExternalGs1Misclassification,
  validateExternalFixture,
  validateExternalFixtureSet,
  type ExternalFixture,
} from "./external-open-license-contract";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "fixtures", "alpha5", "external-open-license", "manifest.json");
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
  const manifest = JSON.parse(manifestText) as { fixtures: ExternalFixture[] };
  validateExternalFixtureSet(manifest.fixtures);
  const projectPhotoManifest = JSON.parse(fs.readFileSync(PROJECT_PHOTO_MANIFEST_PATH, "utf8")) as { fixtures?: Array<{ sourceType?: string }> };
  const projectOwnedRealPhotos = (projectPhotoManifest.fixtures ?? []).filter((fixture) => fixture.sourceType === "project-photo").length;
  const sourceIdentity = {
    commitSha: git("rev-parse", "HEAD"),
    treeSha: git("rev-parse", "HEAD^{tree}"),
    repositoryDirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
  };
  const engine = createZxingCppWasmEngine();
  const results: Array<Record<string, unknown>> = [];
  await engine.initialize();
  try {
    for (const fixture of manifest.fixtures) {
      validateExternalFixture(fixture);
      const absolute = path.join(ROOT, fixture.file);
      if (!fs.existsSync(absolute)) throw new Error(`${fixture.id}: original file is missing`);
      const bytes = fs.readFileSync(absolute);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== fixture.sha256) throw new Error(`${fixture.id}: SHA-256 mismatch`);
      const frame = await loadNormalizedFrameFromPath(absolute, fixture.id);
      const started = performance.now();
      const outcome = await engine.decode(frame, { formats: [...PUBLIC_BARCODE_FORMATS], findMultiple: true });
      const elapsedMs = performance.now() - started;
      const actual = outcome.ok ? outcome.results.map((result) => ({ format: result.format, payload: result.text, isGs1: result.isGs1 === true })) : [];
      const diff = diffExternalResultMultiset(fixture.requiredResults, actual);
      const passed = diff.missing.length === 0 && diff.unexpected.length === 0;
      results.push({
        id: fixture.id,
        sha256,
        width: frame.width,
        height: frame.height,
        elapsedMs,
        expectedOutcome: fixture.expectedOutcome,
        expectedResultCount: fixture.expectedResultCount,
        requiredResults: fixture.requiredResults,
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
        passed,
      });
    }
  } finally {
    await engine.dispose();
  }

  const latencies = results.map((result) => result.elapsedMs as number);
  const fixtureCount = results.length;
  const requiredResultCount = results.reduce((count, result) => count + (result.requiredResults as unknown[]).length, 0);
  const missingResultCount = results.reduce((count, result) => count + (result.missingResults as unknown[]).length, 0);
  const exactResultCount = requiredResultCount - missingResultCount;
  const visiblePhysicalInstanceCount = results.reduce((count, result) => count + Number(result.physicalInstanceCount), 0);
  const observedResultCount = results.reduce((count, result) => count + (result.actualResults as unknown[]).length, 0);
  const unexpectedResultCount = results.reduce((count, result) => count + (result.unexpectedResults as unknown[]).length, 0);
  const externalOpenLicenseGate = fixtureCount >= 12 && results.every((result) => result.passed === true);
  const report = {
    schemaVersion: "2.0-alpha5-external-validation-report",
    generatedAt: new Date().toISOString(),
    manifestSha256: crypto.createHash("sha256").update(manifestText.replaceAll("\r\n", "\n")).digest("hex"),
    sourceIdentity,
    sdkVersion: SDK_VERSION,
    engine: { id: engine.id, version: engine.version },
    status: externalOpenLicenseGate ? "PASS_EXTERNAL_OPEN_LICENSE" : "FAIL_EXTERNAL_OPEN_LICENSE",
    fixtureCount,
    requiredResultCount,
    exactResultCount,
    visiblePhysicalInstanceCount,
    observedResultCount,
    formatMisclassificationCount: results.reduce((count, result) => count + (result.unexpectedResults as Array<{ format: ExternalFixture["format"]; payload: string; isGs1?: boolean }>).filter((actual) => (
      isExternalFormatMisclassification(result.requiredResults as ExternalFixture["requiredResults"], actual)
    )).length, 0),
    gs1MisclassificationCount: results.reduce((count, result) => count + (result.unexpectedResults as Array<{ format: ExternalFixture["format"]; payload: string; isGs1?: boolean }>).filter((actual) => (
      isExternalGs1Misclassification(result.requiredResults as ExternalFixture["requiredResults"], actual)
    )).length, 0),
    falsePositiveCount: unexpectedResultCount,
    projectOwnedRealPhotos,
    projectOwnedRealPhotoCountGate: projectOwnedRealPhotos >= 12,
    externalOpenLicenseCorpusCount: fixtureCount,
    externalOpenLicenseGate,
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
  const failed = results.filter((result) => result.passed !== true);
  console.log(`Verified ${fixtureCount} external open-license originals, ${visiblePhysicalInstanceCount} visible instances, and ${exactResultCount}/${requiredResultCount} semantic results; externalOpenLicenseGate=${externalOpenLicenseGate}; projectOwnedRealPhotos=${projectOwnedRealPhotos}.`);
  if (failed.length) {
    throw new Error(`External open-license Ground Truth mismatch: ${failed.map((result) => result.id).join(", ")}`);
  }
  if (process.argv.includes("--gate") && !externalOpenLicenseGate) {
    throw new Error(`External open-license corpus gate failed: ${fixtureCount}/12 fixtures passed exact Ground Truth verification.`);
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
