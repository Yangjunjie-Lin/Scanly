import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { BenchmarkFixture, BrowserBenchmarkReport } from "@scanly/benchmark";

const root = path.resolve(__dirname, "../..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixtures/manifest.json"), "utf8")) as { fixtures: BenchmarkFixture[] };
const fixtureIds = ["02-clear-text", "27-inverted-01", "65-multiple-eight", "70-version-20", "73-dense-checker-background", "74-zxing-contribution-blur", "56-negative-random-noise"];

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)] ?? 0;
}

test("records an isolated browser runtime benchmark", async ({ page, browser, browserName }, testInfo) => {
  const results: BrowserBenchmarkReport["results"] = [];
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
    }
    const payloads = await page.getByTestId("decoded-result-item").evaluateAll((elements) => elements.map((element) => element.getAttribute("data-payload") ?? ""));
    const single = await page.getByTestId("decoded-output").inputValue();
    const actual = payloads.length ? payloads : single ? [single] : [];
    const required = fixture.requiredInstances?.flatMap((entry) => Array.from({ length: entry.count }, () => entry.payload)) ?? fixture.requiredPayloads ?? (Array.isArray(fixture.expectedPayload) ? fixture.expectedPayload : [fixture.expectedPayload]).filter(Boolean);
    results.push({ fixtureId: id, pass: fixture.expectedOutcome === "decode" ? required.every((payload, index) => actual[index] === payload) : actual.length === 0, elapsedMs: Date.now() - started, payloads: actual });
  }
  const platform = await page.evaluate(() => ({ userAgent: navigator.userAgent, platform: navigator.platform, worker: typeof Worker !== "undefined", offscreen: typeof OffscreenCanvas !== "undefined", imageBitmap: typeof createImageBitmap !== "undefined", memory: "memory" in performance ? "performance.memory available but non-standard" : "browser heap observation unavailable" }));
  const positives = results.filter((result) => manifest.fixtures.find((fixture) => fixture.id === result.fixtureId)?.expectedOutcome === "decode");
  const negativeIds = new Set(manifest.fixtures.filter((fixture) => fixture.expectedOutcome !== "decode").map((fixture) => fixture.id));
  const report: BrowserBenchmarkReport = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    metadata: { browserName, browserVersion: browser.version(), operatingSystem: platform.userAgent, architecture: platform.platform, workerAvailable: platform.worker, offscreenCanvasAvailable: platform.offscreen, imageBitmapAvailable: platform.imageBitmap },
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
  expect(results.every((result) => result.pass)).toBe(true);
  expect(report.falsePositiveCount).toBe(0);
});
