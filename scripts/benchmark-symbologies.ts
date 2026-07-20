import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PUBLIC_BARCODE_FORMATS, SDK_VERSION, type EngineDecodeResult } from "@scanly/core";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { loadNormalizedFrameFromPath } from "@scanly/node";
import type { BarcodeFormat } from "@scanly/scenario-schema";
import {
  ALPHA5_SDK_VERSION,
  allSymbologyGatesPassed,
  evaluateSymbologyGates,
  FORMAT_FAMILIES,
  formatGateFailureTable,
  type FormatFamily,
  type SymbologyGateResult,
} from "./symbology-gates.js";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "fixtures", "alpha5", "manifest.json");
const TRACKED_ALIAS = path.join(ROOT, "benchmark-results", "symbologies.json");

interface RequiredResult { format: BarcodeFormat; payload: string }
interface Fixture {
  id: string;
  file: string;
  format?: BarcodeFormat;
  formatClass?: string;
  sourceType: "generated" | "project-photo" | "external-open-license";
  expectedPayload?: string | null;
  expectedFormat?: BarcodeFormat;
  payloadVerificationStatus?: "verified" | "unknown" | "sensitive";
  sourcePage?: string;
  sourceRepository?: string;
  originalFilename?: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  retrievedAt?: string;
  modifications?: unknown[];
  publicRepositorySafe?: boolean;
  provenanceNote?: string;
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

interface ExternalCohortSummary {
  fixtureTotal: number;
  fixturePassed: number;
  resultTotal: number;
  exactResults: number;
  perFormatRecall: Record<BarcodeFormat, { total: number; decoded: number; recall: number | null }>;
  detectionOnlyTotal: number;
  detectionOnlyPassed: number;
  detectionOnlyRecall: number | null;
  averageLatencyMs: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  exactPayloadKnownTotal: number;
  exactPayloadKnownPassed: number;
  exactPayloadRecall: number | null;
  formatMisclassificationCount: number;
  falsePositiveCount: number;
  provenanceCompleteness: { complete: number; total: number; rate: number | null };
  publicRepositorySafety: { safe: number; total: number; rate: number | null };
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

function familyOf(format: BarcodeFormat): FormatFamily | undefined {
  for (const [family, formats] of Object.entries(FORMAT_FAMILIES) as Array<[FormatFamily, readonly BarcodeFormat[]]>) {
    if (formats.includes(format)) return family;
  }
  return undefined;
}

async function git(args: string[]): Promise<string> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  return (await promisify(execFile)("git", args, { cwd: ROOT })).stdout.trim();
}

function parseCli(argv: string[]) {
  const outputArgument = argv.find((argument) => argument.startsWith("--output="));
  return {
    gate: argv.includes("--gate"),
    development: argv.includes("--development") || (!argv.includes("--gate") && !argv.includes("--canonical-candidate")),
    canonicalCandidate: argv.includes("--canonical-candidate"),
    output: outputArgument
      ? path.resolve(outputArgument.slice("--output=".length))
      : path.join(ROOT, "benchmark-results", "development", "symbologies.json"),
  };
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv);
  if (cli.canonicalCandidate && !cli.gate) {
    throw new Error("--canonical-candidate requires --gate.");
  }
  if (cli.canonicalCandidate && path.resolve(cli.output) === path.resolve(TRACKED_ALIAS)) {
    throw new Error("--canonical-candidate must not write the tracked Canonical symbologies alias; supply an isolated --output path.");
  }

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
      const requestedFormats = fixture.sourceType === "external-open-license"
        ? [...PUBLIC_BARCODE_FORMATS]
        : fixture.requiredResults.length
        ? [...new Set(fixture.requiredResults.map((result) => result.format))]
        : [...PUBLIC_BARCODE_FORMATS];
      const frame = await loadNormalizedFrameFromPath(path.join(ROOT, fixture.file), fixture.id);
      const fixtureStarted = performance.now();
      const outcome = await engine.decode(frame, { formats: requestedFormats, findMultiple: fixture.requiredResults.length > 1 });
      const elapsedMs = performance.now() - fixtureStarted;
      const actual = outcome.ok ? outcome.results : [];
      const detectionOnly = fixture.sourceType === "external-open-license"
        && fixture.payloadVerificationStatus === "unknown";
      const pass = fixture.expectedOutcome === "no-symbol"
        ? !outcome.ok && outcome.category === "not-found"
        : detectionOnly
          ? outcome.ok && actual.some((result) => result.format === (fixture.expectedFormat ?? fixture.format))
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
    if (fixture.sourceType === "external-open-license") continue;
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

  const mixed = manifest.fixtures.map((fixture, index) => ({ fixture, result: results[index] })).filter(({ fixture }) => fixture.sourceType === "generated" && fixture.requiredResults.length > 1);
  const gs1 = manifest.fixtures.map((fixture, index) => ({ fixture, result: results[index] })).filter(({ fixture }) => fixture.sourceType !== "external-open-license" && fixture.expectedGs1);
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
  const clean = positivePairs.filter(({ fixture }) => fixture.sourceType === "generated" && fixture.difficultyTags.length === 1 && fixture.difficultyTags[0] === "clear");
  const difficult = positivePairs.filter(({ fixture }) => fixture.sourceType === "generated" && fixture.requiredResults.length === 1 && !(fixture.difficultyTags.length === 1 && fixture.difficultyTags[0] === "clear"));
  const realPhotos = positivePairs.filter(({ fixture }) => fixture.sourceType === "project-photo");
  const externalPhotos = positivePairs.filter(({ fixture }) => fixture.sourceType === "external-open-license");
  const cleanSummary = cohortSummary(clean);
  const difficultSummary = cohortSummary(difficult);
  const mixedSummary = cohortSummary(mixed);
  const realPhotoSummary = cohortSummary(realPhotos);
  const externalDetectionOnly = externalPhotos.filter(({ fixture }) => fixture.payloadVerificationStatus === "unknown");
  const baseExternalSummary = cohortSummary(externalPhotos);
  const externalPerFormatRecall = Object.fromEntries(PUBLIC_BARCODE_FORMATS.map((format) => {
    const expected = externalPhotos.filter(({ fixture }) => (fixture.expectedFormat ?? fixture.format) === format);
    const decoded = expected.filter(({ fixture, result }) => result.actualResults.some((actual) => (
      actual.format === format
      && (fixture.payloadVerificationStatus === "unknown" || fixture.expectedPayload === actual.payload)
    ))).length;
    return [format, { total: expected.length, decoded, recall: expected.length ? decoded / expected.length : null }];
  })) as Record<BarcodeFormat, { total: number; decoded: number; recall: number | null }>;
  const completeExternalProvenance = externalPhotos.filter(({ fixture }) => [
    fixture.sourcePage, fixture.sourceRepository, fixture.originalFilename, fixture.author,
    fixture.license, fixture.licenseUrl, fixture.attribution, fixture.retrievedAt, fixture.provenanceNote,
  ].every((value) => typeof value === "string" && value.length > 0) && Array.isArray(fixture.modifications));
  const expectedExternalFormat = ({ fixture }: typeof externalPhotos[number]) => fixture.expectedFormat ?? fixture.format;
  const externalFormatMisclassificationCount = externalPhotos.reduce((count, entry) => (
    count + entry.result.actualResults.filter((actual) => expectedExternalFormat(entry) !== actual.format).length
  ), 0);
  const externalFalsePositiveCount = externalPhotos.reduce((count, { fixture, result }) => count + result.actualResults.filter((actual) => {
    if (fixture.payloadVerificationStatus === "unknown") return actual.format !== (fixture.expectedFormat ?? fixture.format);
    return actual.format !== (fixture.expectedFormat ?? fixture.format) || actual.payload !== fixture.expectedPayload;
  }).length, 0);
  const externalSummary: ExternalCohortSummary = {
    ...baseExternalSummary,
    perFormatRecall: externalPerFormatRecall,
    detectionOnlyTotal: externalDetectionOnly.length,
    detectionOnlyPassed: externalDetectionOnly.filter(({ result }) => result.pass).length,
    detectionOnlyRecall: externalDetectionOnly.length
      ? externalDetectionOnly.filter(({ result }) => result.pass).length / externalDetectionOnly.length
      : null,
    averageLatencyMs: externalPhotos.length
      ? externalPhotos.reduce((sum, { result }) => sum + result.elapsedMs, 0) / externalPhotos.length : 0,
    medianLatencyMs: percentile(externalPhotos.map(({ result }) => result.elapsedMs), 50),
    p95LatencyMs: percentile(externalPhotos.map(({ result }) => result.elapsedMs), 95),
    exactPayloadKnownTotal: baseExternalSummary.resultTotal,
    exactPayloadKnownPassed: baseExternalSummary.exactResults,
    exactPayloadRecall: baseExternalSummary.resultTotal ? baseExternalSummary.exactResults / baseExternalSummary.resultTotal : null,
    formatMisclassificationCount: externalFormatMisclassificationCount,
    falsePositiveCount: externalFalsePositiveCount,
    provenanceCompleteness: {
      complete: completeExternalProvenance.length,
      total: externalPhotos.length,
      rate: externalPhotos.length ? completeExternalProvenance.length / externalPhotos.length : null,
    },
    publicRepositorySafety: {
      safe: externalPhotos.filter(({ fixture }) => fixture.publicRepositorySafe === true).length,
      total: externalPhotos.length,
      rate: externalPhotos.length ? externalPhotos.filter(({ fixture }) => fixture.publicRepositorySafe === true).length / externalPhotos.length : null,
    },
  };
  const latencies = results.map((result) => result.elapsedMs);
  const memory = engine.getMemoryObservation();
  const repositoryDirty = (await git(["status", "--porcelain"])).length > 0;
  const invalidChecksumAcceptanceCount = manifest.fixtures.reduce((count, fixture, index) => (
    count + (fixture.difficultyTags.includes("checksum_invalid") && results[index].actualResults.length > 0 ? 1 : 0)
  ), 0);
  const realPhotoFamilyCounts = Object.fromEntries(
    (Object.keys(FORMAT_FAMILIES) as FormatFamily[]).map((family) => [
      family,
      realPhotos.filter(({ fixture }) => {
        const format = fixture.format ?? fixture.requiredResults[0]?.format;
        return format ? familyOf(format) === family : false;
      }).length,
    ]),
  ) as Record<FormatFamily, number>;

  const gateInputs = {
    sdkVersion: SDK_VERSION,
    sourceIdentity: {
      commitSha: await git(["rev-parse", "HEAD"]),
      treeSha: await git(["rev-parse", "HEAD^{tree}"]),
      repositoryDirty,
    },
    corpus: {
      projectOwnedRealPhotos: manifest.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length,
      externalOpenLicenseCorpusCount: manifest.fixtures.filter((fixture) => fixture.sourceType === "external-open-license").length,
    },
    cohorts: {
      generatedClean: cleanSummary,
      generatedDifficult: difficultSummary,
      generatedMixed: mixedSummary,
      projectOwnedRealPhotos: realPhotoSummary,
      externalOpenLicenseRealWorld: externalSummary,
    },
    acceptedFormatMisclassificationCount: Object.entries(confusion).reduce((count, [expected, row]) => count + Object.entries(row).reduce((rowCount, [actual, value]) => rowCount + (actual === expected ? 0 : value), 0), 0),
    formatSelectionAccuracy: selectedResults ? selectedCorrect / selectedResults : null,
    checksumRejectionCount: manifest.fixtures.filter((fixture, index) => fixture.difficultyTags.includes("checksum_invalid") && results[index].actualResults.length === 0).length,
    gs1RecognitionAccuracy: { total: gs1.length, recognized: gs1.filter(({ result }) => result.pass).length, accuracy: gs1.length ? gs1.filter(({ result }) => result.pass).length / gs1.length : null },
    mixedFormatCompleteness: { total: mixed.length, complete: mixed.filter(({ result }) => result.pass).length, rate: mixed.length ? mixed.filter(({ result }) => result.pass).length / mixed.length : null },
    falsePositiveCount: manifest.fixtures.reduce((count, fixture, index) => count + (fixture.expectedOutcome === "no-symbol" ? results[index].actualResults.length : 0), 0),
    invalidChecksumAcceptanceCount,
    realPhotoFamilyCounts,
  };

  const gateResults: SymbologyGateResult[] = evaluateSymbologyGates(gateInputs, { canonicalCandidate: cli.canonicalCandidate });
  const gatesPassed = allSymbologyGatesPassed(gateResults);

  const report = {
    schemaVersion: "alpha5-symbology-evidence-1",
    sdkVersion: SDK_VERSION,
    generatedAt: new Date().toISOString(),
    mode: cli.canonicalCandidate ? "canonical-candidate" : cli.gate ? "gate" : "development",
    sourceIdentity: {
      ...gateInputs.sourceIdentity,
      symbologyManifestHash: hash(manifestBytes),
      datasetHash: hash(manifest.fixtures.map((fixture) => `${fixture.id}\u001f${hash(fs.readFileSync(path.join(ROOT, fixture.file)))}`).join("\n")),
    },
    corpus: {
      total: manifest.fixtures.length, positive: positives.length, negative: negatives.length,
      generated: manifest.fixtures.filter((fixture) => fixture.sourceType === "generated").length,
      projectOwnedRealPhotos: gateInputs.corpus.projectOwnedRealPhotos,
      externalOpenLicenseCorpusCount: gateInputs.corpus.externalOpenLicenseCorpusCount,
      realPhotoGateComplete: gatesPassed && gateInputs.corpus.projectOwnedRealPhotos >= 12,
      realPhotoFamilyCounts,
    },
    cohorts: gateInputs.cohorts,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).map((result) => result.id),
    perFormatRecall: Object.fromEntries(Object.entries(expectedByFormat).map(([format, metrics]) => [format, { total: metrics.total, decoded: metrics.decoded, recall: metrics.total ? metrics.decoded / metrics.total : null }])),
    perFormatExactAccuracy: Object.fromEntries(Object.entries(expectedByFormat).map(([format, metrics]) => [format, { total: metrics.total, exact: metrics.exact, accuracy: metrics.total ? metrics.exact / metrics.total : null }])),
    perFormatFalsePositives: Object.fromEntries(Object.entries(expectedByFormat).map(([format, metrics]) => [format, metrics.falsePositives])),
    formatConfusionMatrix: confusion,
    acceptedFormatMisclassificationCount: gateInputs.acceptedFormatMisclassificationCount,
    formatSelectionAccuracy: gateInputs.formatSelectionAccuracy,
    checksumRejectionCount: gateInputs.checksumRejectionCount,
    invalidChecksumAcceptanceCount,
    gs1RecognitionAccuracy: gateInputs.gs1RecognitionAccuracy,
    mixedFormatCompleteness: gateInputs.mixedFormatCompleteness,
    falsePositiveCount: gateInputs.falsePositiveCount,
    performance: {
      coldInitializationMs, averageLatencyMs: latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length),
      medianLatencyMs: percentile(latencies, 50), p95LatencyMs: percentile(latencies, 95), totalDurationMs: performance.now() - started,
      wasmMemory: memory,
    },
    gates: Object.fromEntries(gateResults.map((gate) => [gate.id, gate.passed])),
    gateResults,
    results,
    externalOpenLicenseRealWorld: externalSummary,
  };

  if (cli.canonicalCandidate) {
    if (SDK_VERSION !== ALPHA5_SDK_VERSION) throw new Error(`Canonical symbology candidate requires SDK ${ALPHA5_SDK_VERSION}.`);
    if (repositoryDirty) throw new Error("Canonical symbology candidate requires a clean repository.");
    if (!report.sourceIdentity.commitSha || !report.sourceIdentity.treeSha) throw new Error("Canonical symbology candidate requires Source Commit and Source Tree.");
    if (!gatesPassed) {
      console.error(formatGateFailureTable(gateResults));
      throw new Error("Canonical symbology candidate failed one or more release gates.");
    }
  }

  await fs.promises.mkdir(path.dirname(cli.output), { recursive: true });
  await fs.promises.writeFile(cli.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Alpha.5 symbologies: ${report.passed}/${report.corpus.total}; false positives=${report.falsePositiveCount}; mixed=${report.mixedFormatCompleteness.complete}/${report.mixedFormatCompleteness.total}; gates=${gateResults.filter((gate) => gate.passed).length}/${gateResults.length}.`);
  console.log(`Wrote ${cli.output}`);

  if (cli.gate && !gatesPassed) {
    console.error(formatGateFailureTable(gateResults));
    process.exitCode = 1;
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
