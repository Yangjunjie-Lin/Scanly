import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PUBLIC_BARCODE_FORMATS, SDK_VERSION, type EngineDecodeResult } from "@scanly/core";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { loadNormalizedFrameFromPath } from "@scanly/node";
import type { BarcodeFormat } from "@scanly/scenario-schema";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "fixtures", "alpha5", "manifest.json");

interface RequiredResult { format: BarcodeFormat; payload: string }
interface Fixture {
  id: string;
  file: string;
  format?: BarcodeFormat;
  sourceType: "generated" | "project-photo";
  expectedOutcome: "decode" | "no-symbol";
  requiredResults: RequiredResult[];
  difficultyTags: string[];
  expectedGs1?: boolean;
}

interface FixtureResult {
  id: string;
  pass: boolean;
  elapsedMs: number;
  requestedFormats: BarcodeFormat[];
  requiredResults: RequiredResult[];
  actualResults: Array<RequiredResult & { isGs1: boolean; rawBytes: number }>;
  failureCategory?: string;
}

function hash(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function exactRequired(required: readonly RequiredResult[], actual: readonly EngineDecodeResult[]): boolean {
  const remaining = actual.map((result) => `${result.format}\u001f${result.text}`);
  for (const result of required) {
    const index = remaining.indexOf(`${result.format}\u001f${result.payload}`);
    if (index < 0) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

async function git(args: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  return (await promisify(execFile)("git", args, { cwd: ROOT })).stdout.trim();
}

async function main(): Promise<void> {
  const manifestBytes = await fs.promises.readFile(MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { schemaVersion: string; fixtures: Fixture[] };
  const engine = createZxingCppWasmEngine();
  const results: FixtureResult[] = [];
  const started = performance.now();
  let coldInitializationMs = 0;
  try {
    const initializationStarted = performance.now();
    await engine.initialize();
    coldInitializationMs = performance.now() - initializationStarted;
    for (const fixture of manifest.fixtures) {
      const requestedFormats = fixture.requiredResults.length
        ? [...new Set(fixture.requiredResults.map((result) => result.format))]
        : [...PUBLIC_BARCODE_FORMATS];
      const frame = await loadNormalizedFrameFromPath(path.join(ROOT, fixture.file), fixture.id);
      const fixtureStarted = performance.now();
      const outcome = await engine.decode(frame, { formats: requestedFormats, findMultiple: fixture.requiredResults.length > 1 });
      const elapsedMs = performance.now() - fixtureStarted;
      const actual = outcome.ok ? outcome.results : [];
      const pass = fixture.expectedOutcome === "no-symbol"
        ? !outcome.ok && outcome.category === "not-found"
        : outcome.ok && exactRequired(fixture.requiredResults, actual)
          && (!fixture.expectedGs1 || actual.some((result) => result.isGs1));
      results.push({
        id: fixture.id, pass, elapsedMs, requestedFormats, requiredResults: fixture.requiredResults,
        actualResults: actual.map((result) => ({ format: result.format, payload: result.text, isGs1: result.isGs1 === true, rawBytes: result.rawBytes?.byteLength ?? 0 })),
        ...(!outcome.ok ? { failureCategory: outcome.category } : {}),
      });
    }
  } finally {
    await engine.dispose();
  }

  const positives = manifest.fixtures.filter((fixture) => fixture.expectedOutcome === "decode");
  const negatives = manifest.fixtures.filter((fixture) => fixture.expectedOutcome === "no-symbol");
  const expectedByFormat = Object.fromEntries(PUBLIC_BARCODE_FORMATS.map((format) => [format, { total: 0, decoded: 0, exact: 0, falsePositives: 0 }])) as Record<BarcodeFormat, { total: number; decoded: number; exact: number; falsePositives: number }>;
  const confusion = Object.fromEntries(PUBLIC_BARCODE_FORMATS.map((format) => [format, Object.fromEntries(PUBLIC_BARCODE_FORMATS.map((actual) => [actual, 0]))])) as Record<BarcodeFormat, Record<BarcodeFormat, number>>;
  let selectedResults = 0;
  let selectedCorrect = 0;
  for (let index = 0; index < manifest.fixtures.length; index += 1) {
    const fixture = manifest.fixtures[index];
    const result = results[index];
    for (const required of fixture.requiredResults) {
      const metrics = expectedByFormat[required.format];
      metrics.total += 1;
      const samePayload = result.actualResults.find((actual) => actual.payload === required.payload);
      if (samePayload) {
        metrics.decoded += 1;
        confusion[required.format][samePayload.format] += 1;
        if (samePayload.format === required.format) metrics.exact += 1;
      }
    }
    for (const actual of result.actualResults) {
      selectedResults += 1;
      if (result.requestedFormats.includes(actual.format)) selectedCorrect += 1;
      if (fixture.expectedOutcome === "no-symbol") expectedByFormat[actual.format].falsePositives += 1;
    }
  }

  const mixed = manifest.fixtures.map((fixture, index) => ({ fixture, result: results[index] })).filter(({ fixture }) => fixture.requiredResults.length > 1);
  const gs1 = manifest.fixtures.map((fixture, index) => ({ fixture, result: results[index] })).filter(({ fixture }) => fixture.expectedGs1);
  const positivePairs = manifest.fixtures.map((fixture, index) => ({ fixture, result: results[index] })).filter(({ fixture }) => fixture.expectedOutcome === "decode");
  const cohortSummary = (entries: typeof positivePairs) => {
    const required = entries.flatMap(({ fixture }) => fixture.requiredResults);
    const exactResults = entries.reduce((total, { fixture, result }) => {
      const remaining = result.actualResults.map((actual) => `${actual.format}\u001f${actual.payload}`);
      return total + fixture.requiredResults.reduce((count, expected) => {
        const index = remaining.indexOf(`${expected.format}\u001f${expected.payload}`);
        if (index < 0) return count;
        remaining.splice(index, 1);
        return count + 1;
      }, 0);
    }, 0);
    const perFormatRecall = Object.fromEntries(PUBLIC_BARCODE_FORMATS.map((format) => {
      const expected = entries.flatMap(({ fixture }) => fixture.requiredResults).filter((result) => result.format === format);
      const decoded = entries.reduce((count, { fixture, result }) => count + fixture.requiredResults.filter((required) => required.format === format && result.actualResults.some((actual) => actual.format === format && actual.payload === required.payload)).length, 0);
      return [format, { total: expected.length, decoded, recall: expected.length ? decoded / expected.length : null }];
    })) as Record<BarcodeFormat, { total: number; decoded: number; recall: number | null }>;
    return {
      fixtureTotal: entries.length,
      fixturePassed: entries.filter(({ result }) => result.pass).length,
      resultTotal: required.length,
      exactResults,
      perFormatRecall,
    };
  };
  const clean = positivePairs.filter(({ fixture }) => fixture.difficultyTags.length === 1 && fixture.difficultyTags[0] === "clear");
  const difficult = positivePairs.filter(({ fixture }) => fixture.requiredResults.length === 1 && !(fixture.difficultyTags.length === 1 && fixture.difficultyTags[0] === "clear"));
  const realPhotos = positivePairs.filter(({ fixture }) => fixture.sourceType === "project-photo");
  const cleanSummary = cohortSummary(clean);
  const difficultSummary = cohortSummary(difficult);
  const mixedSummary = cohortSummary(mixed);
  const realPhotoSummary = cohortSummary(realPhotos);
  const latencies = results.map((result) => result.elapsedMs);
  const memory = engine.getMemoryObservation();
  const repositoryDirty = (await git(["status", "--porcelain"])).length > 0;
  const report = {
    schemaVersion: "alpha5-symbology-evidence-1",
    sdkVersion: SDK_VERSION,
    generatedAt: new Date().toISOString(),
    sourceIdentity: {
      commitSha: await git(["rev-parse", "HEAD"]), treeSha: await git(["rev-parse", "HEAD^{tree}"]), repositoryDirty,
      symbologyManifestHash: hash(manifestBytes),
      datasetHash: hash(manifest.fixtures.map((fixture) => `${fixture.id}\u001f${hash(fs.readFileSync(path.join(ROOT, fixture.file)))}`).join("\n")),
    },
    corpus: {
      total: manifest.fixtures.length, positive: positives.length, negative: negatives.length,
      generated: manifest.fixtures.filter((fixture) => fixture.sourceType === "generated").length,
      projectOwnedRealPhotos: manifest.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length,
      realPhotoGateComplete: manifest.fixtures.some((fixture) => fixture.sourceType === "project-photo"),
    },
    cohorts: {
      generatedClean: cleanSummary,
      generatedDifficult: difficultSummary,
      generatedMixed: mixedSummary,
      projectOwnedRealPhotos: realPhotoSummary,
    },
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).map((result) => result.id),
    perFormatRecall: Object.fromEntries(Object.entries(expectedByFormat).map(([format, metrics]) => [format, { total: metrics.total, decoded: metrics.decoded, recall: metrics.total ? metrics.decoded / metrics.total : null }])),
    perFormatExactAccuracy: Object.fromEntries(Object.entries(expectedByFormat).map(([format, metrics]) => [format, { total: metrics.total, exact: metrics.exact, accuracy: metrics.total ? metrics.exact / metrics.total : null }])),
    perFormatFalsePositives: Object.fromEntries(Object.entries(expectedByFormat).map(([format, metrics]) => [format, metrics.falsePositives])),
    formatConfusionMatrix: confusion,
    acceptedFormatMisclassificationCount: Object.entries(confusion).reduce((count, [expected, row]) => count + Object.entries(row).reduce((rowCount, [actual, value]) => rowCount + (actual === expected ? 0 : value), 0), 0),
    formatSelectionAccuracy: selectedResults ? selectedCorrect / selectedResults : null,
    checksumRejectionCount: manifest.fixtures.filter((fixture, index) => fixture.difficultyTags.includes("checksum_invalid") && results[index].actualResults.length === 0).length,
    gs1RecognitionAccuracy: { total: gs1.length, recognized: gs1.filter(({ result }) => result.pass).length, accuracy: gs1.length ? gs1.filter(({ result }) => result.pass).length / gs1.length : null },
    mixedFormatCompleteness: { total: mixed.length, complete: mixed.filter(({ result }) => result.pass).length, rate: mixed.length ? mixed.filter(({ result }) => result.pass).length / mixed.length : null },
    falsePositiveCount: manifest.fixtures.reduce((count, fixture, index) => count + (fixture.expectedOutcome === "no-symbol" ? results[index].actualResults.length : 0), 0),
    performance: {
      coldInitializationMs, averageLatencyMs: latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
      medianLatencyMs: percentile(latencies, 50), p95LatencyMs: percentile(latencies, 95), totalDurationMs: performance.now() - started,
      wasmMemory: memory,
    },
    gates: {
      generatedCleanRecall: Object.values(cleanSummary.perFormatRecall).filter(({ total }) => total > 0).every(({ recall }) => (recall ?? 0) >= 0.95),
      generatedDifficultRecall: Object.values(difficultSummary.perFormatRecall).filter(({ total }) => total > 0).every(({ recall }) => (recall ?? 0) >= 0.85),
      zeroFalsePositives: manifest.fixtures.every((fixture, index) => fixture.expectedOutcome !== "no-symbol" || results[index].actualResults.length === 0),
      zeroFormatMisclassification: Object.entries(confusion).every(([expected, row]) => Object.entries(row).every(([actual, count]) => actual === expected || count === 0)),
      zeroInvalidChecksumAcceptance: manifest.fixtures.every((fixture, index) => !fixture.difficultyTags.includes("checksum_invalid") || results[index].actualResults.length === 0),
      mixedFormatComplete: mixed.every(({ result }) => result.pass),
      projectOwnedRealPhotos: realPhotos.length >= 12,
    },
    results,
  };
  const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
  const output = outputArgument ? path.resolve(outputArgument.slice("--output=".length)) : path.join(ROOT, "benchmark-results", "development", "symbologies.json");
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  await fs.promises.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Alpha.5 symbologies: ${report.passed}/${report.corpus.total}; false positives=${report.falsePositiveCount}; mixed=${report.mixedFormatCompleteness.complete}/${report.mixedFormatCompleteness.total}.`);
  console.log(`Wrote ${output}`);
  if (report.falsePositiveCount > 0) process.exitCode = 1;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
