import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import type { BenchmarkFixture, BrowserBenchmarkReport } from "@scanly/benchmark";
import { computeDatasetHash, sha256, stableJson } from "../../scripts/benchmark-provenance.js";

const root = path.resolve(__dirname, "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixtures/manifest.json"), "utf8")) as { fixtures: BenchmarkFixture[] };
const smokeFixtureIds = ["02-clear-text", "27-inverted-01", "65-multiple-eight", "70-version-20", "73-dense-checker-background", "74-zxing-contribution-blur", "56-negative-random-noise"];
const benchmarkKind = process.env.BROWSER_BENCHMARK_KIND === "full" ? "full" : "smoke";
const fixtureIds = benchmarkKind === "full" ? manifest.fixtures.map((fixture) => fixture.id) : smokeFixtureIds;

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)] ?? 0;
}

function sameMultiset(left: string[], right: string[]): boolean {
  const counts = (values: string[]) => values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
  return JSON.stringify(Object.entries(counts(left)).sort()) === JSON.stringify(Object.entries(counts(right)).sort());
}

test("records an isolated browser runtime benchmark", async ({ page, browser, browserName }, testInfo) => {
  const results: Array<BrowserBenchmarkReport["results"][number] & { engineIds: string[]; wasmVariants: string[] }> = [];
  await page.goto("/");
  await page.getByRole("tab", { name: "Upload" }).click();
  for (const id of fixtureIds) {
    const fixture = manifest.fixtures.find((entry) => entry.id === id)!;
    const started = Date.now();
    await page.getByTestId("upload-input").setInputFiles(path.join(root, fixture.file));
    if (fixture.expectedOutcome === "decode") {
      const expectedCount = fixture.expectedResultCount ?? 1;
      if (expectedCount > 1) await expect(page.getByTestId("decoded-result-item")).toHaveCount(expectedCount, { timeout: 100_000 });
      else await expect(page.getByTestId("decoded-output")).not.toHaveValue("", { timeout: 100_000 });
    } else {
      await expect(page.getByTestId("error-message")).toBeVisible({ timeout: 100_000 });
      await expect(page.getByTestId("decoded-result-item")).toHaveCount(0);
      await expect(page.getByTestId("decoded-output")).toHaveValue("");
    }
    const payloads = await page.getByTestId("decoded-result-item").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-payload") ?? ""));
    const single = await page.getByTestId("decoded-output").inputValue();
    const engineElements = payloads.length ? page.getByTestId("decoded-result-item") : page.getByTestId("decoded-output");
    const engineIds = await engineElements.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-engine") ?? "").filter(Boolean));
    const wasmVariants = await engineElements.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-engine-variant") ?? "").filter(Boolean));
    const actual = payloads.length ? payloads : single ? [single] : [];
    const required = fixture.requiredInstances?.flatMap((entry) => Array.from({ length: entry.count }, () => entry.payload)) ?? fixture.requiredPayloads ?? (Array.isArray(fixture.expectedPayload) ? fixture.expectedPayload : [fixture.expectedPayload]).filter(Boolean);
    results.push({ fixtureId: id, pass: fixture.expectedOutcome === "decode" ? sameMultiset(required, actual) : actual.length === 0, elapsedMs: Date.now() - started, payloads: actual, engineIds, wasmVariants });
  }
  const platform = await page.evaluate(() => ({ userAgent: navigator.userAgent, platform: navigator.platform, worker: typeof Worker !== "undefined", offscreen: typeof OffscreenCanvas !== "undefined", imageBitmap: typeof createImageBitmap !== "undefined", videoFrame: typeof VideoFrame !== "undefined", memory: "memory" in performance ? "performance.memory available but non-standard" : "browser heap observation unavailable", debug: window.__SCANLY_WORKER_DEBUG__ }));
  const positives = results.filter((result) => manifest.fixtures.find((fixture) => fixture.id === result.fixtureId)?.expectedOutcome === "decode");
  const negativeIds = new Set(manifest.fixtures.filter((fixture) => fixture.expectedOutcome !== "decode").map((fixture) => fixture.id));
  const report: BrowserBenchmarkReport = {
    schemaVersion: "2.0",
    benchmarkKind,
    generatedAt: new Date().toISOString(),
    sourceIdentity: {
      commitSha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      treeSha: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim(),
      sdkVersion: (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as { version: string }).version,
      datasetHash: await computeDatasetHash(path.join(root, "fixtures", "manifest.json"), manifest.fixtures.map((fixture) => fixture.file), root),
      scenarioHash: sha256(stableJson(JSON.parse(fs.readFileSync(path.join(root, "scenarios", "generic", "balanced.json"), "utf8")))),
      engineVersions: {
        jsqr: (JSON.parse(fs.readFileSync(path.join(root, "engines", "jsqr", "package.json"), "utf8")) as { version: string }).version,
        "zxing-js": (JSON.parse(fs.readFileSync(path.join(root, "engines", "zxing-js", "package.json"), "utf8")) as { version: string }).version,
        "zxing-cpp-wasm": (JSON.parse(fs.readFileSync(path.join(root, "engines", "zxing-cpp-wasm", "package.json"), "utf8")) as { version: string }).version,
      },
      wasmBuildHash: (JSON.parse(fs.readFileSync(path.join(root, "engines", "zxing-cpp-wasm", "wasm", "metadata.json"), "utf8")) as { assets: { standard: { sha256: string } } }).assets.standard.sha256,
      fixtureIds,
    },
    metadata: {
      browserName,
      browserVersion: browser.version(),
      operatingSystem: platform.userAgent,
      architecture: platform.platform,
      workerAvailable: platform.worker,
      offscreenCanvasAvailable: platform.offscreen,
      imageBitmapAvailable: platform.imageBitmap,
      videoFrameAvailable: platform.videoFrame,
      userAgent: platform.userAgent,
      testProjectName: testInfo.project.name,
      actualDecodePath: platform.debug?.workerDecodeCount && platform.debug?.mainThreadDecodeCount ? "mixed" : platform.debug?.workerDecodeCount ? "worker" : platform.debug?.mainThreadDecodeCount ? "main-thread" : "unknown",
      workerCreatedCount: platform.debug?.created ?? 0,
      workerTerminationCount: platform.debug?.terminated ?? 0,
      workerDecodeCount: platform.debug?.workerDecodeCount ?? 0,
      mainThreadDecodeCount: platform.debug?.mainThreadDecodeCount ?? 0,
      observedEngineIds: [...new Set(results.flatMap((result) => result.engineIds))].sort(),
      observedWasmVariants: [...new Set(results.flatMap((result) => result.wasmVariants))].sort(),
    },
    fixtureCount: results.length,
    positiveRecall: positives.filter((result) => result.pass).length / Math.max(1, positives.length),
    falsePositiveCount: results.filter((result) => negativeIds.has(result.fixtureId) && result.payloads.length > 0).length,
    averageMs: results.reduce((sum, result) => sum + result.elapsedMs, 0) / Math.max(1, results.length),
    p95Ms: percentile(results.map((result) => result.elapsedMs), 95),
    memoryObservation: platform.memory,
    results,
  };
  const outputDirectory = path.join(root, "benchmark-results", "browser"); fs.mkdirSync(outputDirectory, { recursive: true });
  const output = path.join(outputDirectory, `${testInfo.project.name}.json`); fs.writeFileSync(output, JSON.stringify(report, null, 2));
  const failures = results.filter((result) => !result.pass).map((result) => result.fixtureId);
  if (benchmarkKind === "smoke") expect(failures).toEqual([]);
  else expect(failures.every((id) => id === "14-damaged")).toBe(true);
  expect(report.falsePositiveCount).toBe(0);
});
