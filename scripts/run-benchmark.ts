/**
 * Upload-mode decode benchmark against fixtures/manifest.json.
 * Writes benchmark-results/latest.json|csv and regenerates docs/benchmark.md.
 */
import fs from "node:fs";
import path from "node:path";
import { SDK_VERSION, createRgbaFrame, type CaptureRouter } from "@scanly/core";
import { createNodeCaptureRouter, loadPixelBufferFromPath } from "@scanly/node";
import { getBuiltinScenario, type BuiltinScenarioId } from "@scanly/scenario-schema";
import type { BenchmarkExecutionMode, BenchmarkFixture, BenchmarkFixtureResult, BenchmarkRunSummary } from "@scanly/benchmark";
import { toCsvRow } from "@scanly/benchmark";
import { summarizeBenchmarkVariance, summarizeIterationCorrectness } from "@scanly/benchmark";
import {
  evaluateFixture,
  requiredPayloads,
  requiredPayloadsForProfile,
} from "@scanly/benchmark";
import {
  evaluateBenchmarkGates,
  type BenchmarkBaseline,
} from "@scanly/benchmark";
import { assertCleanRepository, collectSourceIdentity } from "./benchmark-provenance.js";
import { resolveActiveBaseline, runtimeFamily } from "./baseline-registry.js";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "fixtures", "manifest.json");
const OUT_DIR = path.join(ROOT, "benchmark-results");
const BASELINE_REGISTRY_PATH = path.join(OUT_DIR, "baselines", "registry.json");

interface ManifestFile {
  seed: number;
  fixtures: BenchmarkFixture[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    median: median(values),
    p95: percentile(sorted, 95),
  };
}

function toCsv(results: BenchmarkFixtureResult[]): string {
  const header = [
    "id",
    "category",
    "expectedPayload",
    "actualPayload",
    "allPayloads",
    "pass",
    "elapsedMs",
    "successfulDecoder",
    "preprocessingPath",
    "candidateIndex",
    "attemptCount",
    "failureReason",
    "missingPayloads",
    "unexpectedPayloads",
    "requiredPayloadCount",
    "decodedPayloadCount",
    "candidateGenerationMs",
    "engineMs",
    "preprocessMs",
    "rotationMs",
    "timeToFirstResultMs",
    "controlledMemoryPeakBytes",
  ];
  const rows = results.map((r) =>
    toCsvRow([
      r.id,
      r.category,
      Array.isArray(r.expectedPayload) ? r.expectedPayload.join("|") : r.expectedPayload,
      r.actualPayload ?? "",
      r.allPayloads.join("|"),
      r.pass ? "pass" : "fail",
      r.elapsedMs.toFixed(1),
      r.successfulDecoder ?? "",
      r.preprocessingPath ?? "",
      r.candidateIndex ?? "",
      r.attemptCount,
      r.failureReason ?? "",
      (r.missingPayloads ?? []).join("|"),
      (r.unexpectedPayloads ?? []).join("|"),
      r.requiredPayloadCount ?? "",
      r.decodedPayloadCount ?? "",
      r.phaseTiming?.candidateGenerationMs ?? "",
      r.phaseTiming?.engineMs ? JSON.stringify(r.phaseTiming.engineMs) : "",
      r.phaseTiming?.preprocessMs ?? "",
      r.phaseTiming?.rotationMs ?? "",
      r.timeToFirstResultMs ?? "",
      r.controlledMemoryPeakBytes ?? "",
    ])
  );
  return [header.join(","), ...rows].join("\n");
}

function renderMarkdown(summary: BenchmarkRunSummary, smoke: boolean): string {
  const lines: string[] = [];
  lines.push(`# Benchmark`);
  lines.push("");
  lines.push(
    `This document is **auto-generated** from \`benchmark-results/latest.json\`. Do not edit results by hand.`
  );
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Generated at | ${summary.generatedAt} |`);
  lines.push(`| Mode | ${smoke ? "smoke subset" : "full"} |`);
  lines.push(`| Total fixtures | ${summary.total} |`);
  lines.push(`| Successful decodes | ${summary.passed} |`);
  lines.push(`| Failed decodes | ${summary.failed} |`);
  lines.push(`| Success rate | ${(summary.successRate * 100).toFixed(1)}% |`);
  lines.push(`| Average elapsed | ${(summary.averageMs / 1000).toFixed(2)}s |`);
  lines.push(`| Median elapsed | ${(summary.medianMs / 1000).toFixed(2)}s |`);
  lines.push(`| P95 elapsed | ${(summary.p95Ms / 1000).toFixed(2)}s |`);
  lines.push(`| P99 elapsed | ${summary.p99Ms === null ? "insufficient sample (<100)" : `${(summary.p99Ms / 1000).toFixed(2)}s`} |`);
  lines.push(`| Decode recall | ${(summary.decodeRecall * 100).toFixed(1)}% (${summary.positiveCases - summary.results.filter((result) => result.expectedOutcome === "decode" && !result.pass).length}/${summary.positiveCases}) |`);
  lines.push(`| False positives | ${summary.falsePositiveCount}/${summary.negativeCases} (${(summary.falsePositiveRate * 100).toFixed(1)}%) |`);
  lines.push(`| Average attempts | ${summary.averageAttempts.toFixed(1)} |`);
  lines.push(`| Median attempts | ${summary.medianAttempts.toFixed(1)} |`);
  lines.push(`| P95 attempts | ${summary.p95Attempts.toFixed(1)} |`);
  lines.push(`| Regressions vs baseline | ${summary.regressionCount} |`);
  lines.push("");
  lines.push(`## Phase timing distribution`);
  lines.push("");
  lines.push(`| Phase | Average | Median | P95 |`);
  lines.push(`| --- | ---: | ---: | ---: |`);
  for (const [phase, stats] of Object.entries(summary.phaseTiming)) {
    lines.push(`| ${phase} | ${stats.average.toFixed(1)}ms | ${stats.median.toFixed(1)}ms | ${stats.p95.toFixed(1)}ms |`);
  }
  lines.push("");
  lines.push(`## Multiple QR completeness`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Multiple fixtures | ${summary.multipleCompleteness.total} |`);
  lines.push(`| Complete (all required payloads) | ${summary.multipleCompleteness.complete} |`);
  if (summary.multipleCompleteness.incomplete.length) {
    lines.push(`| Incomplete | ${summary.multipleCompleteness.incomplete.join(", ")} |`);
  }
  lines.push("");
  lines.push(`## Worst fixtures (by elapsed time)`);
  lines.push("");
  for (const w of summary.worstFixtures) {
    lines.push(
      `- \`${w.id}\`: ${(w.elapsedMs / 1000).toFixed(2)}s, ${w.attemptCount} attempts, ${w.pass ? "pass" : "fail"}`
    );
  }
  lines.push("");
  lines.push(`## Per-category`);
  lines.push("");
  lines.push(`| Category | Images | Success | Rate | Avg time |`);
  lines.push(`| --- | ---: | ---: | ---: | ---: |`);
  for (const [cat, stats] of Object.entries(summary.perCategory).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(
      `| ${cat} | ${stats.total} | ${stats.passed}/${stats.total} | ${(stats.successRate * 100).toFixed(0)}% | ${(stats.averageMs / 1000).toFixed(2)}s |`
    );
  }
  lines.push("");
  lines.push(`## Decoder distribution`);
  lines.push("");
  for (const [k, v] of Object.entries(summary.decoderDistribution)) {
    lines.push(`- \`${k}\`: ${v}`);
  }
  lines.push("");
  lines.push(`## Preprocessing success distribution`);
  lines.push("");
  for (const [k, v] of Object.entries(summary.preprocessingDistribution)) {
    lines.push(`- \`${k}\`: ${v}`);
  }
  lines.push("");
  lines.push(`## Remaining failures`);
  lines.push("");
  if (summary.remainingFailures.length === 0) {
    lines.push(`None.`);
  } else {
    for (const id of summary.remainingFailures) lines.push(`- \`${id}\``);
  }
  lines.push("");
  lines.push(`## Per-fixture results`);
  lines.push("");
  lines.push(
    `| ID | Category | Expected | Actual | Pass | Time | Decoder | Preprocess | Attempts | Failure |`
  );
  lines.push(`| --- | --- | --- | --- | --- | ---: | --- | --- | ---: | --- |`);
  for (const r of summary.results) {
    const exp = Array.isArray(r.expectedPayload) ? r.expectedPayload.join(" | ") : r.expectedPayload;
    lines.push(
      `| ${r.id} | ${r.category} | \`${exp}\` | \`${r.actualPayload ?? ""}\` | ${r.pass ? "Pass" : "Fail"} | ${(r.elapsedMs / 1000).toFixed(2)}s | ${r.successfulDecoder ?? "-"} | ${r.preprocessingPath ?? "-"} | ${r.attemptCount} | ${r.failureReason ?? ""} |`
    );
  }
  lines.push("");
  lines.push(`## Notes`);
  lines.push("");
  lines.push(
    `- Results measure the shared \`@scanly/core\` QR pipeline (same logic used by Upload mode).`
  );
  lines.push(
    `- These numbers are not a claim that Scanly is faster than third-party scanners.`
  );
  lines.push(`- Hard-case fixtures are retained even when they fail.`);
  lines.push("");
  return lines.join("\n");
}

function updateReadmeSummary(summary: BenchmarkRunSummary, manifest: ManifestFile): Promise<void> {
  const readmePath = path.join(ROOT, "README.md");
  const generated = manifest.fixtures.filter((fixture) => fixture.sourceType === "generated").length;
  const projectPhotos = manifest.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length;
  const failures = summary.remainingFailures.length
    ? summary.remainingFailures.map((id) => `\`${id}\``).join(", ")
    : "None";
  const block = [
    "<!-- BENCHMARK_SUMMARY_START -->",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Internal fixtures | ${summary.total} |`,
    `| Generated fixtures | ${generated} |`,
    `| Project-owned photos | ${projectPhotos} |`,
    `| Success on fixture suite | **${summary.passed}/${summary.total} (${(summary.successRate * 100).toFixed(1)}%)** on the current ${summary.total}-case project fixture suite |`,
    `| Positive decode recall | **${summary.results.filter((result) => result.expectedOutcome === "decode" && result.pass).length}/${summary.positiveCases} (${(summary.decodeRecall * 100).toFixed(1)}%)** |`,
    `| Negative false positives | **${summary.falsePositiveCount}/${summary.negativeCases} (${(summary.falsePositiveRate * 100).toFixed(1)}%)** |`,
    `| Remaining failure | ${failures} |`,
    `| Benchmark date | ${summary.generatedAt.slice(0, 10)} |`,
    "| Manifest | [fixtures/manifest.json](fixtures/manifest.json) |",
    "| Canonical JSON | [benchmark-results/latest.json](benchmark-results/latest.json) |",
    "<!-- BENCHMARK_SUMMARY_END -->",
  ].join("\n");
  const current = fs.readFileSync(readmePath, "utf8");
  const updated = current.replace(
    /<!-- BENCHMARK_SUMMARY_START -->[\s\S]*?<!-- BENCHMARK_SUMMARY_END -->/,
    block
  );
  if (updated === current && !current.includes("<!-- BENCHMARK_SUMMARY_START -->")) {
    throw new Error("README benchmark summary markers are missing.");
  }
  return fs.promises.writeFile(readmePath, updated);
}

async function loadBaseline(profile: BuiltinScenarioId, smoke = false): Promise<{ passedIds: Set<string>; metrics: BenchmarkBaseline }> {
  const selected = await resolveActiveBaseline(BASELINE_REGISTRY_PATH, profile, smoke ? "node24-win32-x64" : runtimeFamily());
  console.log(`Selected immutable baseline ${path.relative(ROOT, selected)}`);
  if (!fs.existsSync(selected)) {
    throw new Error(`Missing required benchmark baseline: ${selected}`);
  }
  const raw = JSON.parse(await fs.promises.readFile(selected, "utf8")) as BenchmarkBaseline & {
    passedIds?: string[];
  };
  return { passedIds: new Set(raw.passedIds ?? []), metrics: raw };
}

async function runFixture(router: CaptureRouter, fixture: BenchmarkFixture): Promise<BenchmarkFixtureResult> {
  const filePath = path.join(ROOT, fixture.file);
  const t0 = Date.now();
  try {
    const buffer = await loadPixelBufferFromPath(filePath);
    const scenario = router.getScenario();
    scenario.output.includeDebugTrace = true;
    const outcome = await router.scan(createRgbaFrame(buffer.data, buffer.width, buffer.height, { id: `benchmark-${fixture.id}`, sourceType: "upload" }), { scenario });
    const payloads = outcome.ok ? outcome.results.map((r) => r.rawText) : [];
    const primary = outcome.ok ? outcome.primary : null;
    const completeRequired = requiredPayloads(fixture);
    const profile = router.getScenario().id as "fast" | "balanced" | "robust";
    const effectiveRequired = requiredPayloadsForProfile(fixture, profile);
    const evaluatedFixture = effectiveRequired.length !== completeRequired.length
      ? { ...fixture, requiredPayloads: effectiveRequired, requiredInstances: undefined, expectedResultCount: effectiveRequired.length }
      : fixture;
    const evalResult = evaluateFixture(evaluatedFixture, payloads, { ok: outcome.ok, errorCode: outcome.ok ? undefined : outcome.error.code });
    const required = requiredPayloads(evaluatedFixture);
    return {
      id: fixture.id,
      category: fixture.category,
      expectedPayload: fixture.expectedPayload,
      actualPayload: primary?.rawText ?? null,
      allPayloads: payloads,
      pass: evalResult.pass,
      elapsedMs: Date.now() - t0,
      successfulDecoder: primary?.engine.id ?? null,
      preprocessingPath: primary?.preprocessingPath.join(">") ?? null,
      candidateIndex: primary?.candidate?.index ?? null,
      attemptCount: outcome.attemptCount,
      failureReason: outcome.ok ? (evalResult.pass ? null : "incomplete_multiple") : outcome.error.code,
      expectedOutcome: fixture.expectedOutcome,
      missingPayloads: evalResult.missingPayloads,
      unexpectedPayloads: evalResult.unexpectedPayloads,
      requiredPayloadCount: required.length || undefined,
      decodedPayloadCount: payloads.length,
      timeToFirstResultMs: outcome.ok ? outcome.timing.timeToFirstResultMs : undefined,
      heuristicMetrics: outcome.heuristics,
      controlledMemoryPeakBytes: outcome.timing.controlledMemory?.peakControlledBytes,
      finalControlledMemoryBytes: outcome.timing.controlledMemory?.currentControlledBytes,
      phaseTiming: {
        frameNormalizationMs: outcome.timing.frameNormalizationMs,
        roiMs: outcome.timing.roiMs,
        localizationMs: outcome.timing.localizationMs,
        candidateGenerationMs: outcome.timing.candidateGenerationMs ?? 0,
        candidateDeduplicationMs: outcome.timing.candidateDeduplicationMs,
        preprocessMs: outcome.timing.preprocessingMs ?? 0,
        rotationMs: outcome.timing.rotationMs ?? 0,
        engineMs: outcome.timing.engineMs ?? {},
        validationMs: outcome.timing.validationMs,
        semanticParsingMs: outcome.timing.semanticParsingMs,
      },
    };
  } catch (e) {
    return {
      id: fixture.id,
      category: fixture.category,
      expectedPayload: fixture.expectedPayload,
      actualPayload: null,
      allPayloads: [],
      pass: false,
      elapsedMs: Date.now() - t0,
      successfulDecoder: null,
      preprocessingPath: null,
      candidateIndex: null,
      attemptCount: 0,
      failureReason: e instanceof Error ? e.message : String(e),
      expectedOutcome: fixture.expectedOutcome,
    };
  }
}

async function runMeasuredFixture(router: CaptureRouter, fixture: BenchmarkFixture, iterations: number): Promise<BenchmarkFixtureResult> {
  const runs: BenchmarkFixtureResult[] = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const result = await runFixture(router, fixture);
    runs.push(result);
  }
  const ordered = [...runs].sort((left, right) => left.elapsedMs - right.elapsedMs);
  const representative = ordered[Math.floor(ordered.length / 2)];
  const failed = runs.find((result) => !result.pass);
  const correctness = summarizeIterationCorrectness(runs);
  return {
    ...(failed ?? representative),
    elapsedMs: median(runs.map((result) => result.elapsedMs)),
    attemptCount: Math.round(median(runs.map((result) => result.attemptCount))),
    ...correctness,
    runTimingsMs: correctness.runTimingsMs.slice(0, iterations),
    controlledMemoryPeakBytes: Math.max(0, ...runs.map((result) => result.controlledMemoryPeakBytes ?? 0)),
    finalControlledMemoryBytes: Math.max(0, ...runs.map((result) => result.finalControlledMemoryBytes ?? 0)),
  };
}

async function main() {
  const smoke = process.argv.includes("--smoke");
  const failOnRegression = process.argv.includes("--gate");
  const freezeBaseline = process.argv.includes("--freeze-baseline");
  const canonical = process.argv.includes("--canonical") || freezeBaseline;
  const ciArtifact = process.argv.includes("--ci-artifact");
  const allowDirtyDevelopment = process.argv.includes("--allow-dirty-development") || (!canonical && !ciArtifact);
  if (canonical && ciArtifact) throw new Error("Choose exactly one benchmark execution mode.");
  if (canonical && allowDirtyDevelopment) throw new Error("Canonical and baseline-freeze runs cannot use --allow-dirty-development.");
  if (canonical || ciArtifact) assertCleanRepository(ROOT);
  const baselineId = process.argv.find((argument) => argument.startsWith("--baseline-id="))?.split("=")[1];
  if (freezeBaseline && (!process.argv.includes("--approve-baseline") || !baselineId || !/^v2-alpha3-r\d+$/.test(baselineId))) {
    throw new Error("Baseline freeze requires --approve-baseline and --baseline-id=v2-alpha3-rN.");
  }
  const profileArgument = process.argv.find((argument) => argument.startsWith("--profile="))?.split("=")[1] ?? "balanced";
  if (!["fast", "balanced", "robust"].includes(profileArgument)) throw new Error(`Unknown benchmark profile '${profileArgument}'.`);
  const profile = profileArgument as BuiltinScenarioId;
  const measuredIterations = Number(process.argv.find((argument) => argument.startsWith("--measured-iterations="))?.split("=")[1] ?? (canonical ? 3 : 1));
  const warmupIterations = Number(process.argv.find((argument) => argument.startsWith("--warmup-iterations="))?.split("=")[1] ?? (smoke ? 0 : 1));
  if (!Number.isInteger(measuredIterations) || measuredIterations < 1 || measuredIterations > 10) throw new Error("--measured-iterations must be an integer from 1 to 10.");
  if (!Number.isInteger(warmupIterations) || warmupIterations < 0 || warmupIterations > 5) throw new Error("--warmup-iterations must be an integer from 0 to 5.");
  if (canonical && warmupIterations < 1) throw new Error("Canonical benchmark requires at least one warmup iteration.");
  if (canonical && measuredIterations < 3) throw new Error("Canonical benchmark requires at least three measured iterations.");
  const executionMode: BenchmarkExecutionMode = freezeBaseline ? "baseline-freeze" : canonical ? "canonical" : ciArtifact ? "ci-artifact" : "development";
  const selectedScenario = getBuiltinScenario(profile);
  const router = createNodeCaptureRouter({ scenario: selectedScenario });

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error("Missing fixtures/manifest.json — run npm run fixtures:generate first.");
    process.exit(1);
  }

  const manifestBytes = await fs.promises.readFile(MANIFEST_PATH);
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as ManifestFile;
  let fixtures = manifest.fixtures;

  if (smoke) {
    // Regression smoke: original 16 + key hard cases
    const smokeIds = new Set([
      "01-clear-url",
      "02-clear-text",
      "05-low-contrast",
      "10-small-in-large",
      "11-complex-background",
      "14-damaged",
      "15-inverted",
      "16-multiple-codes",
      "27-inverted-01",
      "33-small-in-large-gen",
      "36-multiple-gen",
    ]);
    fixtures = fixtures.filter((f) => smokeIds.has(f.id));
  }

  const initializationStarted = performance.now();
  await router.engines.initializeAll();
  const coldInitializationMs = performance.now() - initializationStarted;
  for (let iteration = 0; iteration < warmupIterations; iteration++) await runFixture(router, fixtures[iteration % fixtures.length]);
  console.log(`Running benchmark on ${fixtures.length} fixtures${smoke ? " (smoke)" : ""}; measured iterations=${measuredIterations}…`);

  const results: BenchmarkFixtureResult[] = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.id}… `);
    const result = await runMeasuredFixture(router, fixture, measuredIterations);
    results.push(result);
    console.log(result.pass ? `PASS ${(result.elapsedMs / 1000).toFixed(2)}s` : `FAIL ${(result.elapsedMs / 1000).toFixed(2)}s`);
  }

  const times = results.map((r) => r.elapsedMs);
  const sortedTimes = [...times].sort((a, b) => a - b);
  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);

  const decoderDistribution: Record<string, number> = {};
  const preprocessingDistribution: Record<string, number> = {};
  const candidateDistribution: Record<string, number> = {};
  for (const r of passed) {
    if (r.successfulDecoder) {
      decoderDistribution[r.successfulDecoder] = (decoderDistribution[r.successfulDecoder] ?? 0) + 1;
    }
    if (r.preprocessingPath) {
      preprocessingDistribution[r.preprocessingPath] =
        (preprocessingDistribution[r.preprocessingPath] ?? 0) + 1;
    }
    if (r.candidateIndex !== null) {
      const key = String(r.candidateIndex);
      candidateDistribution[key] = (candidateDistribution[key] ?? 0) + 1;
    }
  }

  const perCategory: BenchmarkRunSummary["perCategory"] = {};
  for (const r of results) {
    const slot = (perCategory[r.category] ??= { total: 0, passed: 0, successRate: 0, averageMs: 0 });
    slot.total += 1;
    if (r.pass) slot.passed += 1;
    slot.averageMs += r.elapsedMs;
  }
  for (const slot of Object.values(perCategory)) {
    slot.averageMs = slot.total ? slot.averageMs / slot.total : 0;
    slot.successRate = slot.total ? slot.passed / slot.total : 0;
  }

  const baseline = freezeBaseline
    ? { passedIds: new Set<string>(), metrics: null }
    : await loadBaseline(profile, smoke);
  const baselinePassed = baseline.passedIds;
  let regressionCount = 0;
  if (baselinePassed.size > 0) {
    for (const id of baselinePassed) {
      const r = results.find((x) => x.id === id);
      if (r && !r.pass) regressionCount += 1;
    }
  }

  const attemptCounts = results.map((r) => r.attemptCount);
  const sortedAttempts = [...attemptCounts].sort((a, b) => a - b);

  const multipleResults = results.filter((r) => r.category === "multiple");
  const multipleComplete = multipleResults.filter(
    (r) => r.pass && !(r.missingPayloads?.length ?? 0)
  );

  const worstFixtures = [...results]
    .sort((a, b) => b.elapsedMs - a.elapsedMs)
    .slice(0, 5)
    .map((r) => ({ id: r.id, elapsedMs: r.elapsedMs, attemptCount: r.attemptCount, pass: r.pass }));

  const phaseValues: Record<string, number[]> = {
    candidateGenerationMs: results.map((r) => r.phaseTiming?.candidateGenerationMs ?? 0),
    preprocessMs: results.map((r) => r.phaseTiming?.preprocessMs ?? 0),
    rotationMs: results.map((r) => r.phaseTiming?.rotationMs ?? 0),
    frameNormalizationMs: results.map((r) => r.phaseTiming?.frameNormalizationMs ?? 0),
    roiMs: results.map((r) => r.phaseTiming?.roiMs ?? 0),
    localizationMs: results.map((r) => r.phaseTiming?.localizationMs ?? 0),
    candidateDeduplicationMs: results.map((r) => r.phaseTiming?.candidateDeduplicationMs ?? 0),
    validationMs: results.map((r) => r.phaseTiming?.validationMs ?? 0),
    semanticParsingMs: results.map((r) => r.phaseTiming?.semanticParsingMs ?? 0),
  };
  for (const engineId of [...new Set(results.flatMap((result) => Object.keys(result.phaseTiming?.engineMs ?? {})))].sort()) {
    phaseValues[`engine:${engineId}`] = results.map((result) => result.phaseTiming?.engineMs[engineId] ?? 0);
  }
  const positive = results.filter((result) => result.expectedOutcome === "decode");
  const negative = results.filter((result) => result.expectedOutcome !== "decode");
  const positivePasses = positive.filter((result) => result.pass).length;
  const falsePositiveCount = negative.filter((result) => result.actualPayload !== null).length;
  const timeToFirstValues = results.flatMap((result) => result.timeToFirstResultMs === undefined ? [] : [result.timeToFirstResultMs]);
  const cancellationChecks: boolean[] = [];
  const beforeController = new AbortController();
  beforeController.abort();
  const beforeOutcome = await router.scan(createRgbaFrame(new Uint8ClampedArray(4), 1, 1, { id: "benchmark-cancellation-before" }), { signal: beforeController.signal });
  cancellationChecks.push(!beforeOutcome.ok && beforeOutcome.error.code === "cancelled");
  const activeController = new AbortController();
  const activePixels = new Uint8ClampedArray(512 * 512 * 4);
  for (let index = 0; index < activePixels.length; index += 4) { const value = (index * 1103515245 + 12345) >>> 24; activePixels[index] = activePixels[index + 1] = activePixels[index + 2] = value; activePixels[index + 3] = 255; }
  const activePromise = router.scan(createRgbaFrame(activePixels, 512, 512, { id: "benchmark-cancellation-active" }), { signal: activeController.signal });
  setTimeout(() => activeController.abort(), 0);
  const activeOutcome = await activePromise;
  cancellationChecks.push(!activeOutcome.ok && activeOutcome.error.code === "cancelled");
  const disposalRouter = createNodeCaptureRouter({ scenario: getBuiltinScenario(profile) });
  const disposalPromise = disposalRouter.scan(createRgbaFrame(activePixels.slice(), 512, 512, { id: "benchmark-cancellation-dispose" }));
  const disposing = disposalRouter.dispose();
  const disposalOutcome = await disposalPromise;
  await disposing;
  cancellationChecks.push(!disposalOutcome.ok && disposalOutcome.error.code === "cancelled");
  const sourceIdentity = await collectSourceIdentity({
    root: ROOT,
    scenario: selectedScenario,
    engines: router.engines.list().map((engine) => ({ id: engine.id, version: engine.version, capabilities: engine.capabilities })),
    manifestPath: MANIFEST_PATH,
    fixtureFiles: manifest.fixtures.map((fixture) => fixture.file),
    runnerPath: path.join(ROOT, "scripts", "run-benchmark.ts"),
    allowDirty: allowDirtyDevelopment,
  });

  const summary: BenchmarkRunSummary = {
    schemaVersion: "2.0",
    runtime: { kind: "node", nodeVersion: process.version, platform: process.platform, arch: process.arch },
    sourceIdentity,
    executionPolicy: {
      mode: executionMode,
      canonical,
      warmupIterations,
      measuredIterations,
      dirtyDevelopmentAllowed: executionMode === "development",
      updatesDocumentation: canonical && !freezeBaseline && !smoke && profile === "balanced",
    },
    environment: {
      gitCommit: sourceIdentity.commitSha,
      sdkVersion: SDK_VERSION,
      scenario: profile,
      datasetManifestHash: sourceIdentity.datasetHash,
      fixtureCount: fixtures.length,
      date: new Date().toISOString().slice(0, 10),
      warmupPolicy: `${warmupIterations} explicit warmup fixture run(s); measured fixtures exclude warmup.`,
      iterationCount: measuredIterations,
      coldInitializationMs,
    },
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    successRate: results.length ? passed.length / results.length : 0,
    averageMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    medianMs: median(times),
    p95Ms: percentile(sortedTimes, 95),
    p99Ms: times.length >= 100 ? percentile(sortedTimes, 99) : null,
    variance: summarizeBenchmarkVariance(results),
    positiveCases: positive.length,
    decodeRecall: positive.length ? positivePasses / positive.length : 0,
    exactPayloadAccuracy: positive.length ? positivePasses / positive.length : 0,
    negativeCases: negative.length,
    falsePositiveCount,
    falsePositiveRate: negative.length ? falsePositiveCount / negative.length : 0,
    timeoutCount: results.filter((result) => result.failureReason === "timeout").length,
    cancellationCorrectness: { passed: cancellationChecks.filter(Boolean).length, total: cancellationChecks.length },
    engineInitializationFailures: results.filter((result) => result.failureReason === "engine_initialization_failure").length,
    engineExecutionFailures: results.filter((result) => result.failureReason === "engine_execution_failure").length,
    phaseTimingAvailability: (() => {
      const routed = results.filter((result) => result.failureReason !== "resource_limit_exceeded" || result.attemptCount > 0);
      return {
        passed: routed.filter((result) => result.phaseTiming && result.phaseTiming.candidateGenerationMs >= 0 && Object.values(result.phaseTiming.engineMs).some((value) => value > 0)).length,
        total: routed.length,
      };
    })(),
    timeToFirstResult: distribution(timeToFirstValues),
    averageAttempts: attemptCounts.length
      ? attemptCounts.reduce((a, b) => a + b, 0) / attemptCounts.length
      : 0,
    medianAttempts: median(attemptCounts),
    p95Attempts: percentile(sortedAttempts, 95),
    decoderDistribution,
    preprocessingDistribution,
    candidateDistribution,
    perFormatRecall: { qr_code: { total: positive.length, decoded: positivePasses, recall: positive.length ? positivePasses / positive.length : 0 } },
    memoryObservations: ["Controlled peak covers Scanly-accounted frame artifacts, caches, and scratch leases; it does not claim exact decoder or process heap usage."],
    controlledMemoryPeakBytes: Math.max(0, ...results.map((result) => result.controlledMemoryPeakBytes ?? 0)),
    finalControlledMemoryBytes: Math.max(0, ...results.map((result) => result.finalControlledMemoryBytes ?? 0)),
    phaseTiming: Object.fromEntries(Object.entries(phaseValues).map(([phase, values]) => [phase, distribution(values)])),
    perCategory,
    multipleCompleteness: {
      total: multipleResults.length,
      complete: multipleComplete.length,
      incomplete: multipleResults.filter((r) => !r.pass || (r.missingPayloads?.length ?? 0) > 0).map((r) => r.id),
    },
    worstFixtures,
    regressionCount,
    remainingFailures: failed.map((f) => f.id),
    results,
  };

  const outputDirectory = canonical ? OUT_DIR : path.join(OUT_DIR, executionMode === "ci-artifact" ? "ci" : "development");
  await fs.promises.mkdir(outputDirectory, { recursive: true });
  const outputStem = smoke ? `smoke-${profile}` : profile === "balanced" ? "latest" : `latest-${profile}`;
  const jsonPath = path.join(outputDirectory, `${outputStem}.json`);
  const csvPath = path.join(outputDirectory, `${outputStem}.csv`);
  await fs.promises.writeFile(jsonPath, JSON.stringify(summary, null, 2));
  await fs.promises.writeFile(csvPath, toCsv(results));

  if (canonical && !freezeBaseline && !smoke && profile === "balanced") {
    const md = renderMarkdown(summary, false);
    await fs.promises.writeFile(path.join(ROOT, "docs", "benchmark.md"), md);
    await updateReadmeSummary(summary, manifest);
  }

  console.log("");
  console.log(
    `Result: ${summary.passed}/${summary.total} = ${(summary.successRate * 100).toFixed(1)}% | avg ${(summary.averageMs / 1000).toFixed(2)}s | median ${(summary.medianMs / 1000).toFixed(2)}s | p95 ${(summary.p95Ms / 1000).toFixed(2)}s`
  );
  console.log(
    `Attempts: avg ${summary.averageAttempts.toFixed(1)} | median ${summary.medianAttempts.toFixed(1)} | p95 ${summary.p95Attempts.toFixed(1)}`
  );
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${csvPath}`);

  const gateFailures = baseline.metrics ? evaluateBenchmarkGates(summary, baseline.metrics, { fullSuite: !smoke }) : [];
  if (freezeBaseline) {
    const freezeFailures = [
      ...(sourceIdentity.repositoryDirty ? ["source repository is dirty"] : []),
      ...(!summary.executionPolicy.canonical ? ["execution policy is not canonical"] : []),
      ...(summary.executionPolicy.warmupIterations < 1 ? ["canonical warmup is below one"] : []),
      ...(summary.executionPolicy.measuredIterations < 3 ? ["canonical measured iterations are below three"] : []),
      ...(summary.finalControlledMemoryBytes !== 0 ? ["controlled memory was retained after benchmark scans"] : []),
      ...(summary.timeoutCount ? ["benchmark contains timeouts"] : []),
      ...(summary.engineInitializationFailures ? ["benchmark contains engine initialization failures"] : []),
      ...(summary.engineExecutionFailures ? ["benchmark contains engine execution failures"] : []),
      ...(summary.falsePositiveCount ? ["false-positive gate failed"] : []),
      ...(summary.multipleCompleteness.complete !== summary.multipleCompleteness.total ? ["multiple completeness gate failed"] : []),
      ...gateFailures,
    ];
    const comparisonPath = path.join(OUT_DIR, "comparison.json");
    if (!fs.existsSync(comparisonPath)) freezeFailures.push("comparison report is missing");
    else {
      const comparison = JSON.parse(await fs.promises.readFile(comparisonPath, "utf8")) as { sdkVersion?: string; fixtureCount?: number; sourceIdentity?: { commitSha?: string; treeSha?: string; datasetHash?: string } };
      if (comparison.sdkVersion !== SDK_VERSION || comparison.fixtureCount !== summary.total || comparison.sourceIdentity?.commitSha !== sourceIdentity.commitSha || comparison.sourceIdentity?.treeSha !== sourceIdentity.treeSha || comparison.sourceIdentity?.datasetHash !== sourceIdentity.datasetHash) freezeFailures.push("comparison report is stale");
    }
    if (freezeFailures.length) throw new Error(`Baseline freeze policy failed:\n- ${freezeFailures.join("\n- ")}`);
    const destination = path.join(OUT_DIR, "baselines", `${baselineId}-${profile}-${runtimeFamily().replace("win32", "windows")}.json`);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.writeFile(destination, JSON.stringify({ ...summary, passedIds: passed.map((result) => result.id) }, null, 2), { flag: "wx" });
    console.log(`Frozen immutable baseline ${destination}`);
  }
  await router.dispose();
  if (failOnRegression && gateFailures.length > 0) {
    console.error(`Benchmark gate failed:\n- ${gateFailures.join("\n- ")}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
