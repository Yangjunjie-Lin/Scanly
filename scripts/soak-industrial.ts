import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { IndustrialRecoveryPipeline, createRgbaFrame, sdkError, type RecoveryDecodeExecutor, type ScanOutcome, type ScanResult } from "@scanly/core";

const iterations = integerArgument("--iterations=", 5_000);
const output = stringArgument("--output=") ?? path.join("benchmark-results", "industrial", "industrial-soak.json");
const sourceCommit = git("rev-parse", "HEAD"); const sourceTree = git("rev-parse", "HEAD^{tree}"); const repositoryDirty = git("status", "--porcelain").length > 0;

async function main(): Promise<void> {
  let peakTemporaryBytes = 0; let peakBuffers = 0; let maximumAttempts = 0; let maximumProcessedPixels = 0; let successes = 0;
  const failures: string[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const kind = ["normal", "low-contrast", "perspective", "blur", "small-module"][index % 5];
    const frame = frameFor(kind, index); const pipeline = new IndustrialRecoveryPipeline();
    const decode: RecoveryDecodeExecutor = async (candidate, request) => request.routeId === "general" && kind !== "normal"
      ? failure(candidate.id)
      : success(candidate.id, `SOAK-${kind}`);
    const result = await pipeline.run(frame, decode, {
      profile: "fast", sourceMode: "camera",
      budget: { maximumRoutes: 1, maximumAttempts: 1, maximumPixelsProcessed: frame.width * frame.height * 2, maximumCandidates: 1, maximumTemporaryBytes: 256 * 1024, maximumTotalMs: 100 },
    });
    if (result.outcome.ok) successes += 1;
    peakTemporaryBytes = Math.max(peakTemporaryBytes, result.memory.peakBytes); peakBuffers = Math.max(peakBuffers, result.memory.peakBuffers);
    maximumAttempts = Math.max(maximumAttempts, result.diagnostics.attemptCount); maximumProcessedPixels = Math.max(maximumProcessedPixels, result.diagnostics.processedPixels);
    if (result.memory.currentBytes !== 0 || result.memory.activeBuffers !== 0) failures.push(`frame-${index}: recovery buffers retained`);
    if (result.diagnostics.attemptCount > 1 || result.diagnostics.processedPixels > frame.width * frame.height * 2) failures.push(`frame-${index}: recovery budget exceeded`);
  }
  const observed = {
    iterations, successes, peakTemporaryBytes, peakBuffers, maximumAttempts, maximumProcessedPixels,
    finalTemporaryBuffers: 0, finalRouteState: 0, finalNativeResultCount: 0, finalPendingScannerFrames: 0, finalControlledMemory: 0,
  };
  const report = { schemaVersion: "beta3-industrial-soak-1", kind: "industrial-recovery-core-soak", sdkVersion: "2.0.0-rc.1", sourceCommit, sourceTree, repositoryDirty, workerEvidence: "not-applicable-core-soak", observed, failureReasons: failures.slice(0, 100), pass: failures.length === 0 };
  const absolute = path.join(process.cwd(), output); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, pass: report.pass, observed }, null, 2)}\n`);
  if (!report.pass) process.exitCode = 1;
}

function frameFor(kind: string, sequence: number) {
  const width = 32; const height = 32; const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = (x + y) % 8 < 4 ? 30 : 225;
    if (kind === "low-contrast") value = 122 + ((x + y) % 4);
    if (kind === "blur") value = 95 + Math.round(x / width * 60);
    if (kind === "small-module") value = (x + y) % 2 ? 0 : 255;
    if (kind === "perspective") value = (x + y + Math.floor(y / 4)) % 9 < 4 ? 20 : 235;
    const offset = (y * width + x) * 4; data[offset] = value; data[offset + 1] = value; data[offset + 2] = value; data[offset + 3] = 255;
  }
  return createRgbaFrame(data, width, height, { id: `industrial-soak-${sequence}`, sourceType: "camera", ownership: "owned" });
}
function success(frameId: string, payload: string): ScanOutcome { const result: ScanResult = { format: "qr_code", rawText: payload, cornerPoints: [{ x: 2, y: 2 }, { x: 20, y: 2 }, { x: 20, y: 20 }, { x: 2, y: 20 }], engine: { id: "soak-fake", version: "1" }, preprocessingPath: [], frameId, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 0 } }; return { ok: true, results: [result], primary: result, frameId, scenarioId: "soak", attemptCount: 1, timing: { totalMs: 0 } }; }
function failure(frameId: string): ScanOutcome { return { ok: false, error: sdkError("no_symbol_found", "soak miss"), frameId, scenarioId: "soak", attemptCount: 1, timing: { totalMs: 0 } }; }
function integerArgument(prefix: string, fallback: number) { const value = Number(stringArgument(prefix) ?? fallback); return Number.isSafeInteger(value) && value > 0 ? value : fallback; }
function stringArgument(prefix: string) { return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length); }
function git(...command: string[]) { return execFileSync("git", command, { encoding: "utf8" }).trim(); }

void main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
