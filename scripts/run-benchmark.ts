/**
 * Upload-mode decode benchmark against fixtures/manifest.json.
 * Writes benchmark-results/latest.json|csv and regenerates docs/benchmark.md.
 */
import fs from "node:fs";
import path from "node:path";
import { loadPixelBufferFromPath } from "../lib/qr/image-loader-node";
import { decodePixelBuffer } from "../lib/qr/decode-pipeline";
import type { BenchmarkFixture, BenchmarkFixtureResult, BenchmarkRunSummary } from "../lib/qr/benchmark-types";
import { toCsvRow } from "../lib/benchmark/csv";
import {
  evaluateFixture,
  requiredPayloads,
} from "../lib/benchmark/fixture-contract";
import {
  evaluateBenchmarkGates,
  type BenchmarkBaseline,
} from "../lib/benchmark/quality-gates";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "fixtures", "manifest.json");
const OUT_DIR = path.join(ROOT, "benchmark-results");
const BASELINE_PATH = path.join(OUT_DIR, "baseline-pre-polish.json");

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
    "jsqrMs",
    "zxingMs",
    "preprocessMs",
    "rotationMs",
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
      r.phaseTiming?.jsqrMs ?? "",
      r.phaseTiming?.zxingMs ?? "",
      r.phaseTiming?.preprocessMs ?? "",
      r.phaseTiming?.rotationMs ?? "",
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
    `- Results measure the shared \`lib/qr\` decode pipeline (same logic used by Upload mode).`
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

async function loadBaseline(): Promise<{ passedIds: Set<string>; metrics: BenchmarkBaseline }> {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error(`Missing required benchmark baseline: ${BASELINE_PATH}`);
  }
  const raw = JSON.parse(await fs.promises.readFile(BASELINE_PATH, "utf8")) as BenchmarkBaseline & {
    passedIds?: string[];
  };
  return { passedIds: new Set(raw.passedIds ?? []), metrics: raw };
}

async function runFixture(fixture: BenchmarkFixture): Promise<BenchmarkFixtureResult> {
  const filePath = path.join(ROOT, fixture.file);
  const t0 = Date.now();
  try {
    const buffer = await loadPixelBufferFromPath(filePath);
    const outcome = await decodePixelBuffer(buffer, {
      config: {
        findMultiple: fixture.category === "multiple" || Boolean(fixture.requiredPayloads?.length),
        maxMultipleResults: fixture.expectedResultCount ?? fixture.requiredPayloads?.length ?? 8,
        requiredPayloads: fixture.requiredPayloads,
        expectedResultCount: fixture.expectedResultCount,
        timeoutMs: 15_000,
      },
    });
    const payloads = outcome.ok ? outcome.results.map((r) => r.payload) : [];
    const primary = outcome.ok ? outcome.primary : null;
    const evalResult = evaluateFixture(fixture, payloads, outcome.ok);
    const required = requiredPayloads(fixture);
    return {
      id: fixture.id,
      category: fixture.category,
      expectedPayload: fixture.expectedPayload,
      actualPayload: primary?.payload ?? null,
      allPayloads: payloads,
      pass: evalResult.pass,
      elapsedMs: Date.now() - t0,
      successfulDecoder: primary?.decoder ?? null,
      preprocessingPath: primary?.preprocessing ?? null,
      candidateIndex: primary?.candidateIndex ?? null,
      attemptCount: outcome.attemptCount,
      failureReason: outcome.ok ? (evalResult.pass ? null : "incomplete_multiple") : outcome.reason,
      expectedOutcome: fixture.expectedOutcome,
      missingPayloads: evalResult.missingPayloads,
      unexpectedPayloads: evalResult.unexpectedPayloads,
      requiredPayloadCount: required.length || undefined,
      decodedPayloadCount: payloads.length,
      phaseTiming: outcome.phaseTiming,
    };
  } catch (e) {
    return {
      id: fixture.id,
      category: fixture.category,
      expectedPayload: fixture.expectedPayload,
      actualPayload: null,
      allPayloads: [],
      pass: fixture.expectedOutcome === "fail",
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

async function main() {
  const smoke = process.argv.includes("--smoke");
  const failOnRegression = process.argv.includes("--gate");

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error("Missing fixtures/manifest.json — run npm run fixtures:generate first.");
    process.exit(1);
  }

  const manifest = JSON.parse(await fs.promises.readFile(MANIFEST_PATH, "utf8")) as ManifestFile;
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

  console.log(`Running benchmark on ${fixtures.length} fixtures${smoke ? " (smoke)" : ""}…`);

  const results: BenchmarkFixtureResult[] = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.id}… `);
    const result = await runFixture(fixture);
    results.push(result);
    console.log(result.pass ? `PASS ${(result.elapsedMs / 1000).toFixed(2)}s` : `FAIL ${(result.elapsedMs / 1000).toFixed(2)}s`);
  }

  const times = results.map((r) => r.elapsedMs);
  const sortedTimes = [...times].sort((a, b) => a - b);
  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);

  const decoderDistribution: Record<string, number> = {};
  const preprocessingDistribution: Record<string, number> = {};
  for (const r of passed) {
    if (r.successfulDecoder) {
      decoderDistribution[r.successfulDecoder] = (decoderDistribution[r.successfulDecoder] ?? 0) + 1;
    }
    if (r.preprocessingPath) {
      preprocessingDistribution[r.preprocessingPath] =
        (preprocessingDistribution[r.preprocessingPath] ?? 0) + 1;
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

  const baseline = await loadBaseline();
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

  const phaseValues = {
    candidateGenerationMs: results.map((r) => r.phaseTiming?.candidateGenerationMs ?? 0),
    jsqrMs: results.map((r) => r.phaseTiming?.jsqrMs ?? 0),
    zxingMs: results.map((r) => r.phaseTiming?.zxingMs ?? 0),
    preprocessMs: results.map((r) => r.phaseTiming?.preprocessMs ?? 0),
    rotationMs: results.map((r) => r.phaseTiming?.rotationMs ?? 0),
  };

  const summary: BenchmarkRunSummary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    passed: passed.length,
    failed: failed.length,
    successRate: results.length ? passed.length / results.length : 0,
    averageMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    medianMs: median(times),
    p95Ms: percentile(sortedTimes, 95),
    averageAttempts: attemptCounts.length
      ? attemptCounts.reduce((a, b) => a + b, 0) / attemptCounts.length
      : 0,
    medianAttempts: median(attemptCounts),
    p95Attempts: percentile(sortedAttempts, 95),
    decoderDistribution,
    preprocessingDistribution,
    phaseTiming: {
      candidateGenerationMs: distribution(phaseValues.candidateGenerationMs),
      jsqrMs: distribution(phaseValues.jsqrMs),
      zxingMs: distribution(phaseValues.zxingMs),
      preprocessMs: distribution(phaseValues.preprocessMs),
      rotationMs: distribution(phaseValues.rotationMs),
    },
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

  await fs.promises.mkdir(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, smoke ? "smoke.json" : "latest.json");
  const csvPath = path.join(OUT_DIR, smoke ? "smoke.csv" : "latest.csv");
  await fs.promises.writeFile(jsonPath, JSON.stringify(summary, null, 2));
  await fs.promises.writeFile(csvPath, toCsv(results));

  if (!smoke) {
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

  const gateFailures = evaluateBenchmarkGates(summary, baseline.metrics, { fullSuite: !smoke });
  if (failOnRegression && gateFailures.length > 0) {
    console.error(`Benchmark gate failed:\n- ${gateFailures.join("\n- ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
