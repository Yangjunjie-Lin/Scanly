import fs from "node:fs";
import path from "node:path";
import { createRgbaFrame, type CaptureRouter, type DecoderEngine } from "@scanly/core";
import type { PixelBuffer } from "@scanly/core/qr";
import { createNodeCaptureRouter, loadPixelBufferFromPath } from "@scanly/node";
import { JsQrEngine } from "@scanly/engine-jsqr";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";
import { getBuiltinScenario } from "@scanly/scenario-schema";
import { evaluateFixture, type BenchmarkFixture } from "@scanly/benchmark";

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixtures/manifest.json"), "utf8")) as { fixtures: BenchmarkFixture[] };
type StrategyId = "raw-jsqr" | "raw-zxing-js" | "scanly-fast" | "scanly-balanced" | "scanly-robust";
interface ComparisonResult {
  fixtureId: string;
  strategy: StrategyId;
  success: boolean;
  exactPayload: boolean;
  multipleCase: boolean;
  multipleComplete: boolean;
  payloads: string[];
  latencyMs: number;
  failureReason: string | null;
  unsupportedFormat: boolean;
  falsePositive: boolean;
}

async function rawDecode(strategy: "raw-jsqr" | "raw-zxing-js", pixels: PixelBuffer): Promise<{ payloads: string[]; reason: string | null }> {
  const engine: DecoderEngine = strategy === "raw-jsqr" ? new JsQrEngine() : new ZxingJsEngine();
  const result = await engine.decode(createRgbaFrame(pixels.data, pixels.width, pixels.height), { formats: ["qr_code"], findMultiple: false });
  return { payloads: result.ok ? result.results.map((item) => item.text) : [], reason: result.ok ? null : "no_symbol_found" };
}

async function scenarioDecode(router: CaptureRouter, pixels: PixelBuffer): Promise<{ payloads: string[]; reason: string | null }> {
  const outcome = await router.scan(createRgbaFrame(pixels.data, pixels.width, pixels.height, { sourceType: "upload" }));
  return { payloads: outcome.ok ? outcome.results.map((result) => result.rawText) : [], reason: outcome.ok ? null : outcome.error.code };
}

async function main(): Promise<void> {
  const strategies: StrategyId[] = ["raw-jsqr", "raw-zxing-js", "scanly-fast", "scanly-balanced", "scanly-robust"];
  const routers = Object.fromEntries((["fast", "balanced", "robust"] as const).map((id) => [`scanly-${id}`, createNodeCaptureRouter({ scenario: getBuiltinScenario(id) })])) as Record<"scanly-fast" | "scanly-balanced" | "scanly-robust", CaptureRouter>;
  const results: ComparisonResult[] = [];
  for (const fixture of manifest.fixtures) {
    const pixels = await loadPixelBufferFromPath(path.join(root, fixture.file));
    for (const strategy of strategies) {
      const started = Date.now();
      const decoded = strategy.startsWith("raw-")
        ? await rawDecode(strategy as "raw-jsqr" | "raw-zxing-js", pixels)
        : await scenarioDecode(routers[strategy as keyof typeof routers], pixels);
      const evaluation = evaluateFixture(fixture, decoded.payloads, decoded.payloads.length > 0);
      results.push({
        fixtureId: fixture.id,
        strategy,
        success: decoded.payloads.length > 0,
        exactPayload: fixture.expectedOutcome === "decode" && evaluation.pass,
        multipleCase: fixture.category === "multiple",
        multipleComplete: fixture.category !== "multiple" || evaluation.missingPayloads.length === 0,
        payloads: decoded.payloads,
        latencyMs: Date.now() - started,
        failureReason: decoded.reason,
        unsupportedFormat: false,
        falsePositive: fixture.expectedOutcome === "fail" && decoded.payloads.length > 0,
      });
    }
  }
  const summaries = Object.fromEntries(strategies.map((strategy) => {
    const subset = results.filter((result) => result.strategy === strategy);
    const sorted = subset.map((result) => result.latencyMs).sort((a, b) => a - b);
    return [strategy, {
      cases: subset.length,
      positiveCases: subset.filter((result) => manifest.fixtures.find((fixture) => fixture.id === result.fixtureId)?.expectedOutcome === "decode").length,
      negativeCases: subset.filter((result) => manifest.fixtures.find((fixture) => fixture.id === result.fixtureId)?.expectedOutcome === "fail").length,
      exact: subset.filter((result) => result.exactPayload).length,
      multipleComplete: `${subset.filter((result) => result.multipleCase && result.multipleComplete).length}/${subset.filter((result) => result.multipleCase).length}`,
      falsePositives: subset.filter((result) => result.falsePositive).length,
      averageMs: subset.reduce((sum, result) => sum + result.latencyMs, 0) / Math.max(1, subset.length),
      p95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    }];
  }));
  const report = { schemaVersion: "1.0", generatedAt: new Date().toISOString(), methodology: "All strategies process the same decoded RGBA pixel buffer for each fixture. Timings are Node-only and are not browser-device timings.", summaries, results };
  const output = path.join(root, "benchmark-results/comparison.json");
  await fs.promises.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summaries, null, 2));
  console.log(`Wrote ${output}`);
  await Promise.all(Object.values(routers).map((router) => router.dispose()));
}

main().catch((error) => { console.error(error); process.exit(1); });
