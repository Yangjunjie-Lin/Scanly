import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { LocalUrlAnalyzer, UrlSafetyController, UrlRiskEngine, type UrlSafetyAnalysis } from "@scanly/url-safety";
import { parseSemanticPayload } from "@scanly/parsers";
import { createUrlSafetyAnalyzer } from "@scanly/url-safety/server";

async function main() {
  const local = new LocalUrlAnalyzer();
  const inputs = ["https://example.com", "https://раypal.attacker.com/login?next=https%3A%2F%2Fother.com", "http://127.1", "https://example.com/" + "a".repeat(2_100)];
  const samples: number[] = [];
  for (let index = 0; index < 1_000; index++) { const start = performance.now(); local.analyze(inputs[index % inputs.length]); samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b);
  let remoteCalls = 0;
  const analyzer = createUrlSafetyAnalyzer({ remoteFetcher: { inspect: async () => { remoteCalls++; return { status: "complete", redirectChain: [], bytesRead: 0 }; } } });
  await Promise.all(Array.from({ length: 100 }, () => analyzer.analyze(inputs[0], { mode: "remote" })));
  assert.equal(remoteCalls, 1);
  const disabled = new UrlSafetyController(analyzer, () => {});
  const begin = performance.now();
  for (let i = 0; i < 100_000; i++) disabled.acceptEvent({ type: "emitted", barcode: { text: inputs[0] } });
  const disabledEventUs = (performance.now() - begin) * 1_000 / 100_000;
  disabled.dispose();
  let networkStarted = false; let analysisCompleted = false;
  let release!: (value: UrlSafetyAnalysis) => void;
  const enabled = new UrlSafetyController({ analyze: () => { networkStarted = true; return new Promise((resolve) => { release = resolve; }); } }, (state) => { analysisCompleted ||= state.status === "complete"; });
  enabled.configure("remote");
  const dispatchStart = performance.now(); enabled.accept(parseSemanticPayload(inputs[0]).structured);
  const enabledDispatchMs = performance.now() - dispatchStart;
  await Promise.resolve();
  const latencyIndependentOfNetwork = networkStarted && !analysisCompleted;
  assert.ok(latencyIndependentOfNetwork); release(new UrlRiskEngine().aggregate(local.analyze(inputs[0])));
  await Promise.resolve(); enabled.dispose();
  const root = process.cwd();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "scanly-url-baseline-"));
  let baseline: { sdkVersion: string; medianMs: number; p95Ms: number };
  let current: typeof baseline;
  try {
    // Use immutable 2.0.1 tarballs; never rewrite old records or their checksums.
    const stable = path.join(root, "release/stable/v2.0.1/artifacts/npm");
    const tarballs = fs.readdirSync(stable).filter((name) => name.endsWith(".tgz")).map((name) => path.join(stable, name));
    fs.writeFileSync(path.join(temporary, "package.json"), JSON.stringify({ private: true, type: "module" }));
    assert.ok(process.env.npm_execpath, "Run through npm run benchmark:url-safety");
    execFileSync(process.execPath, [process.env.npm_execpath!, "install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", ...tarballs], { cwd: temporary, stdio: "pipe" });
    const fixture = path.join(root, "fixtures/alpha5/generated/data-matrix-01.png");
    const probe = `
      import { SDK_VERSION } from '@scanly/core';
      import { createNodeCaptureRouter, loadNormalizedFrameFromPath } from '@scanly/node';
      const router = createNodeCaptureRouter({ formats: ['data_matrix'] });
      const samples = [];
      for (let i = 0; i < 45; i++) {
        const frame = await loadNormalizedFrameFromPath(${JSON.stringify(fixture)}, 'url-benchmark');
        const start = performance.now(); const outcome = await router.scan(frame); const elapsed = performance.now() - start;
        if (!outcome.ok || outcome.primary.format !== 'data_matrix') throw new Error('decode regression');
        if (i >= 10) samples.push(elapsed);
      }
      await router.dispose(); samples.sort((a,b) => a-b);
      console.log(JSON.stringify({sdkVersion: SDK_VERSION, medianMs: samples[17], p95Ms: samples[33]}));
    `;
    const run = (cwd: string) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "--eval", probe], { cwd, encoding: "utf8" }).trim());
    baseline = run(temporary); current = run(root);
    assert.equal(baseline.sdkVersion, "2.0.1"); assert.equal(current.sdkVersion, "2.1.0");
  } finally {
    const resolved = fs.realpathSync(temporary);
    assert.ok(path.basename(resolved).startsWith("scanly-url-baseline-") && path.dirname(resolved).toLowerCase() === fs.realpathSync(os.tmpdir()).toLowerCase());
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  const medianDelta = current.medianMs - baseline.medianMs;
  // Same-machine development gate with an absolute noise floor for sub-ms decodes.
  const disabledRegressionPass = medianDelta <= Math.max(2, baseline.medianMs * 0.2);
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const report = { kind: "url-safety-development-benchmark", sourceCommit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD^{tree}"), repositoryDirty: !!git("status", "--porcelain"), baseline, current, disabledMedianDeltaMs: medianDelta, disabledRegressionPass, disabledEventUs, enabledDispatchMs, localP50Ms: samples[500], localP95Ms: samples[950], repeatedUrls: 100, remoteCalls, latencyIndependentOfNetwork, limitation: "Same-machine Node fixture baseline, not browser FPS or physical-device qualification; existing browser/realtime benchmarks remain required." };
  fs.mkdirSync("benchmark-results/development", { recursive: true }); fs.writeFileSync("benchmark-results/development/url-safety-benchmark.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  assert.ok(samples[950] < 10); assert.ok(disabledRegressionPass, "disabled decoder median regressed");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
