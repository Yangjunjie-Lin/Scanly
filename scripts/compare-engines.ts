import fs from "node:fs";
import path from "node:path";
import { CaptureRouter, SDK_VERSION, createRgbaFrame, type DecoderEngine, type EngineDiagnostic } from "@scanly/core";
import type { PixelBuffer } from "@scanly/core/qr";
import { createNodeEngineRegistry, loadPixelBufferFromPath } from "@scanly/node";
import { JsQrEngine } from "@scanly/engine-jsqr";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";
import { createZxingCppWasmEngine, type ZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { getBuiltinScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { evaluateFixture, type BenchmarkFixture, type ComparisonReport, type StrategyFixtureResult, type StrategySummary } from "@scanly/benchmark";
import { assertCleanRepository, collectSourceIdentity } from "./benchmark-provenance.js";
import { validateComparisonReport } from "./canonical-evidence.js";

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "fixtures", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { fixtures: BenchmarkFixture[] };
type StrategyId =
  | "raw-jsqr" | "raw-zxing-js" | "raw-zxing-cpp-wasm"
  | "scanly-fast" | "scanly-balanced" | "scanly-robust"
  | "scanly-jsqr-only" | "scanly-zxing-js-only" | "scanly-zxing-cpp-only"
  | "scanly-js-wasm-sequential" | "scanly-js-wasm-parallel-experimental";

interface StrategyRuntime {
  id: StrategyId;
  engineIds: Array<{ id: string; version: string }>;
  scenario?: ScenarioDefinition;
  router?: CaptureRouter;
  rawEngine?: DecoderEngine;
  installedPackageFootprintBytes: number;
  initializationMs: number;
  warmInitializationMs: number;
  wasmEngine?: ZxingCppWasmEngine;
}

function cloneScenario(id: "fast" | "balanced" | "robust", strategyId: string, engines?: string[], execution?: "sequential" | "parallel"): ScenarioDefinition {
  const scenario = getBuiltinScenario(id);
  scenario.id = strategyId;
  scenario.revision += 1;
  if (engines) scenario.decoders.order = engines;
  if (execution) scenario.decoders.execution = execution;
  scenario.decoders.failurePolicy = "success-wins";
  scenario.ablation.multiEngineFallback = (engines?.length ?? scenario.decoders.order.length) > 1;
  scenario.output.includeDebugTrace = true;
  return scenario;
}

function elapsedMs(started: bigint): number {
  return Number(process.hrtime.bigint() - started) / 1_000_000;
}

function directorySize(directory: string): number {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => total + (entry.isDirectory() ? directorySize(path.join(directory, entry.name)) : fs.statSync(path.join(directory, entry.name)).size), 0);
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * p / 100) - 1)];
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function packageCost(engineIds: string[]): number {
  return engineIds.reduce((total, id) => {
    if (id === "jsqr") return total + directorySize(path.join(root, "node_modules", "jsqr"));
    if (id === "zxing-js") return total + directorySize(path.join(root, "node_modules", "@zxing", "library"));
    if (id === "zxing-cpp-wasm") {
      return total
        + directorySize(path.join(root, "engines", "zxing-cpp-wasm", "dist"))
        + directorySize(path.join(root, "engines", "zxing-cpp-wasm", "wasm"))
        + directorySize(path.join(root, "node_modules", "zxing-wasm"));
    }
    return total;
  }, 0);
}

function engineFailureCode(category: string): string {
  const codes: Record<string, string> = {
    "not-found": "no_symbol_found",
    "invalid-input": "invalid_image",
    "unsupported-format": "unsupported_format",
    "initialization": "engine_initialization_failure",
    "execution": "engine_execution_failure",
  };
  return codes[category] ?? category;
}

async function execute(runtime: StrategyRuntime, pixels: PixelBuffer): Promise<{ payloads: string[]; reason: string | null; attempts: number; peak?: number; final: number; diagnostics?: EngineDiagnostic[] }> {
  if (runtime.rawEngine) {
    const outcome = await runtime.rawEngine.decode(createRgbaFrame(pixels.data, pixels.width, pixels.height), { formats: ["qr_code"], findMultiple: false });
    return { payloads: outcome.ok ? outcome.results.map((result) => result.text) : [], reason: outcome.ok ? null : engineFailureCode(outcome.category), attempts: 1, final: 0 };
  }
  const outcome = await runtime.router!.scan(createRgbaFrame(pixels.data, pixels.width, pixels.height, { sourceType: "upload" }), { scenario: runtime.scenario });
  return {
    payloads: outcome.ok ? outcome.results.map((result) => result.rawText) : [],
    reason: outcome.ok ? null : outcome.error.code,
    attempts: outcome.attemptCount,
    peak: outcome.timing.controlledMemory?.peakControlledBytes,
    final: outcome.timing.controlledMemory?.currentControlledBytes ?? 0,
    diagnostics: outcome.engineDiagnostics,
  };
}

async function main(): Promise<void> {
  const canonical = process.argv.includes("--canonical");
  const canonicalCandidate = process.argv.includes("--canonical-candidate");
  const ciArtifact = process.argv.includes("--ci-artifact");
  if ([canonical, canonicalCandidate, ciArtifact].filter(Boolean).length > 1) throw new Error("Choose exactly one comparison execution mode.");
  const canonicalCompatible = canonical || canonicalCandidate;
  const allowDirty = process.argv.includes("--allow-dirty-development") || (!canonicalCompatible && !ciArtifact);
  if (canonicalCompatible || ciArtifact) assertCleanRepository(root);
  const warmupIterations = Number(process.argv.find((argument) => argument.startsWith("--warmup-iterations="))?.split("=")[1] ?? (canonicalCompatible ? 1 : 0));
  const measuredIterations = Number(process.argv.find((argument) => argument.startsWith("--measured-iterations="))?.split("=")[1] ?? (canonicalCompatible ? 3 : 1));
  if (!Number.isInteger(warmupIterations) || warmupIterations < 0 || !Number.isInteger(measuredIterations) || measuredIterations < 1) throw new Error("Comparison iteration arguments are invalid.");
  if (canonicalCompatible && (warmupIterations < 1 || measuredIterations < 3)) throw new Error("Canonical-compatible comparison requires warmup >= 1 and measured iterations >= 3.");
  const definitions: Array<{ id: StrategyId; raw?: DecoderEngine; scenario?: ScenarioDefinition }> = [
    { id: "raw-jsqr", raw: new JsQrEngine() },
    { id: "raw-zxing-js", raw: new ZxingJsEngine() },
    { id: "raw-zxing-cpp-wasm", raw: createZxingCppWasmEngine() },
    { id: "scanly-fast", scenario: cloneScenario("fast", "comparison-fast") },
    { id: "scanly-balanced", scenario: cloneScenario("balanced", "comparison-balanced") },
    { id: "scanly-robust", scenario: cloneScenario("robust", "comparison-robust") },
    { id: "scanly-jsqr-only", scenario: cloneScenario("balanced", "comparison-jsqr-only", ["jsqr"]) },
    { id: "scanly-zxing-js-only", scenario: cloneScenario("balanced", "comparison-zxing-js-only", ["zxing-js"]) },
    { id: "scanly-zxing-cpp-only", scenario: cloneScenario("balanced", "comparison-zxing-cpp-only", ["zxing-cpp-wasm"]) },
    { id: "scanly-js-wasm-sequential", scenario: cloneScenario("balanced", "comparison-js-wasm-sequential", ["jsqr", "zxing-cpp-wasm", "zxing-js"], "sequential") },
    { id: "scanly-js-wasm-parallel-experimental", scenario: cloneScenario("balanced", "comparison-js-wasm-parallel-experimental", ["jsqr", "zxing-cpp-wasm", "zxing-js"], "parallel") },
  ];
  const runtimes: StrategyRuntime[] = [];
  for (const definition of definitions) {
    const ids = definition.raw ? [definition.raw.id] : definition.scenario!.decoders.order;
    const registry = createNodeEngineRegistry();
    for (const engine of registry.list()) if (!ids.includes(engine.id)) registry.unregister(engine.id);
    const versions = Object.fromEntries(registry.list().map((engine) => [engine.id, engine.version]));
    const initializationStarted = process.hrtime.bigint();
    if (definition.raw) {
      await definition.raw.initialize?.();
      await registry.disposeAll();
    } else {
      await registry.initializeAll();
    }
    const initializationMs = elapsedMs(initializationStarted);
    const warmInitializationStarted = process.hrtime.bigint();
    if (definition.raw) await definition.raw.initialize?.();
    else await registry.initializeAll();
    const warmInitializationMs = elapsedMs(warmInitializationStarted);
    const wasmEngine = (definition.raw?.id === "zxing-cpp-wasm"
      ? definition.raw
      : registry.get("zxing-cpp-wasm")) as ZxingCppWasmEngine | undefined;
    runtimes.push({
      id: definition.id,
      engineIds: ids.map((id) => ({ id, version: definition.raw?.version ?? versions[id] ?? "unknown" })),
      scenario: definition.scenario,
      rawEngine: definition.raw,
      router: definition.scenario ? new CaptureRouter({ scenario: definition.scenario, engines: registry }) : undefined,
      installedPackageFootprintBytes: packageCost(ids),
      initializationMs,
      warmInitializationMs,
      wasmEngine,
    });
  }

  const perFixture: StrategyFixtureResult[] = [];
  if (warmupIterations > 0) {
    const pixels = await loadPixelBufferFromPath(path.join(root, manifest.fixtures[0].file));
    for (let iteration = 0; iteration < warmupIterations; iteration++) for (const runtime of runtimes) await execute(runtime, pixels);
  }
  for (const fixture of manifest.fixtures) {
    const pixels = await loadPixelBufferFromPath(path.join(root, fixture.file));
    for (const runtime of runtimes) {
      const runs: Array<Awaited<ReturnType<typeof execute>> & { elapsedMs: number; pass: boolean }> = [];
      for (let iteration = 0; iteration < measuredIterations; iteration++) {
        const runStarted = Date.now();
        let actual: Awaited<ReturnType<typeof execute>>;
        try { actual = await execute(runtime, pixels); }
        catch (error) { actual = { payloads: [], reason: error instanceof Error ? error.message : String(error), attempts: 0, final: 0 }; }
        const evaluation = evaluateFixture(fixture, actual.payloads, { ok: actual.payloads.length > 0, errorCode: actual.reason ?? undefined });
        runs.push({ ...actual, elapsedMs: Date.now() - runStarted, pass: evaluation.pass });
      }
      const ordered = [...runs].sort((left, right) => left.elapsedMs - right.elapsedMs);
      const actual = ordered[Math.floor(ordered.length / 2)];
      const evaluation = evaluateFixture(fixture, actual.payloads, { ok: actual.payloads.length > 0, errorCode: actual.reason ?? undefined });
      const payloadSignatures = new Set(runs.map((run) => JSON.stringify([...run.payloads].sort())));
      perFixture.push({
        fixtureId: fixture.id,
        strategyId: runtime.id,
        expectedOutcome: fixture.expectedOutcome,
        payloads: actual.payloads,
        pass: runs.every((run) => run.pass),
        exactPayload: fixture.expectedOutcome === "decode" && runs.every((run) => run.pass),
        falsePositive: fixture.expectedOutcome !== "decode" && runs.some((run) => run.payloads.length > 0),
        multipleComplete: fixture.category !== "multiple" || runs.every((run) => evaluateFixture(fixture, run.payloads, { ok: run.payloads.length > 0, errorCode: run.reason ?? undefined }).missingPayloads.length === 0),
        elapsedMs: median(runs.map((run) => run.elapsedMs)),
        attemptCount: Math.round(median(runs.map((run) => run.attempts))),
        failureReason: actual.reason,
        controlledMemoryPeakBytes: Math.max(0, ...runs.map((run) => run.peak ?? 0)),
        finalControlledMemoryBytes: Math.max(0, ...runs.map((run) => run.final)),
        iterationPassCount: runs.filter((run) => run.pass).length,
        iterationFailureCount: runs.filter((run) => !run.pass).length,
        unstablePayload: payloadSignatures.size > 1,
        runTimingsMs: runs.map((run) => run.elapsedMs),
        engineDiagnostics: actual.diagnostics?.map(({ engineId, status, elapsedMs, attemptCount, resultCount }) => ({ engineId, status, elapsedMs, attemptCount, resultCount })),
      });
    }
  }

  const passersByFixture = new Map(manifest.fixtures.map((fixture) => [fixture.id, perFixture.filter((result) => result.fixtureId === fixture.id && result.exactPayload).map((result) => result.strategyId)]));
  const strategies: StrategySummary[] = runtimes.map((runtime) => {
    const subset = perFixture.filter((result) => result.strategyId === runtime.id);
    const positives = subset.filter((result) => result.expectedOutcome === "decode");
    const multiple = subset.filter((result) => manifest.fixtures.find((fixture) => fixture.id === result.fixtureId)?.category === "multiple");
    const peaks = subset.flatMap((result) => result.controlledMemoryPeakBytes === undefined ? [] : [result.controlledMemoryPeakBytes]);
    return {
      strategyId: runtime.id,
      engineIds: runtime.engineIds,
      scenario: runtime.scenario ? { id: runtime.scenario.id, revision: runtime.scenario.revision } : undefined,
      fixtureCount: subset.length,
      positiveRecall: positives.length ? positives.filter((result) => result.payloads.length > 0).length / positives.length : 0,
      exactPayloadAccuracy: positives.length ? positives.filter((result) => result.exactPayload).length / positives.length : 0,
      falsePositiveCount: subset.filter((result) => result.falsePositive).length,
      multiCodeCompleteness: { complete: multiple.filter((result) => result.multipleComplete).length, total: multiple.length },
      averageMs: subset.reduce((sum, result) => sum + result.elapsedMs, 0) / Math.max(1, subset.length),
      medianMs: median(subset.map((result) => result.elapsedMs)),
      p95Ms: percentile(subset.map((result) => result.elapsedMs), 95),
      averageAttempts: subset.reduce((sum, result) => sum + result.attemptCount, 0) / Math.max(1, subset.length),
      p95Attempts: percentile(subset.map((result) => result.attemptCount), 95),
      timeoutCount: subset.filter((result) => result.failureReason === "timeout").length,
      unsupportedCases: subset.filter((result) => /unsupported/.test(result.failureReason ?? "")).length,
      initializationFailures: subset.filter((result) => /initialization/.test(result.failureReason ?? "")).length,
      executionFailures: subset.filter((result) => /execution/.test(result.failureReason ?? "")).length,
      uniqueWins: subset.filter((result) => {
        if (!result.exactPayload) return false;
        if (runtime.id.startsWith("raw-")) {
          return !perFixture.some((entry) =>
            entry.fixtureId === result.fixtureId
            && entry.strategyId.startsWith("raw-")
            && entry.strategyId !== runtime.id
            && entry.exactPayload
          );
        }
        return passersByFixture.get(result.fixtureId)?.length === 1;
      }).map((result) => result.fixtureId),
      installedPackageFootprintBytes: runtime.installedPackageFootprintBytes,
      initializationMs: runtime.initializationMs,
      warmInitializationMs: runtime.warmInitializationMs,
      wasmVariant: runtime.wasmEngine?.selectedVariant ?? undefined,
      wasmLinearMemoryPeakBytes: runtime.wasmEngine?.getMemoryObservation().peakLinearMemoryBytes,
      averageControlledMemoryPeakBytes: peaks.reduce((sum, value) => sum + value, 0) / Math.max(1, peaks.length),
    };
  });
  const identityRegistry = createNodeEngineRegistry();
  const sourceIdentity = await collectSourceIdentity({
    root,
    scenario: definitions.map(({ id, scenario }) => ({ id, scenario })),
    engines: identityRegistry.list().map((engine) => ({ id: engine.id, version: engine.version, capabilities: engine.capabilities })),
    manifestPath,
    fixtureFiles: manifest.fixtures.map((fixture) => fixture.file),
    runnerPath: path.join(root, "scripts", "compare-engines.ts"),
    allowDirty,
  });
  await identityRegistry.disposeAll();
  const sequential = strategies.find((strategy) => strategy.strategyId === "scanly-js-wasm-sequential")!;
  const parallel = strategies.find((strategy) => strategy.strategyId === "scanly-js-wasm-parallel-experimental")!;
  const parallelAccepted = parallel.positiveRecall >= sequential.positiveRecall - 0.01
    && parallel.exactPayloadAccuracy >= sequential.exactPayloadAccuracy - 0.01
    && parallel.falsePositiveCount <= sequential.falsePositiveCount
    && parallel.multiCodeCompleteness.complete >= sequential.multiCodeCompleteness.complete
    && parallel.timeoutCount === 0
    && parallel.initializationFailures === 0
    && parallel.executionFailures === 0;
  const report: ComparisonReport & { runtime: { kind: "node"; nodeVersion: string; platform: string; arch: string } } = {
    schemaVersion: "2.0",
    generatedAt: new Date().toISOString(),
    sdkVersion: SDK_VERSION,
    runtime: { kind: "node", nodeVersion: process.version, platform: process.platform, arch: process.arch },
    sourceIdentity,
    executionPolicy: {
      mode: canonicalCandidate ? "canonical-candidate" : canonical ? "canonical" : ciArtifact ? "ci-artifact" : "development",
      evidenceType: canonicalCandidate ? "canonical-candidate" : ciArtifact ? "ci-artifact" : canonical ? "canonical-committed" : "development",
      canonical: canonicalCompatible,
      warmupIterations,
      measuredIterations,
      dirtyDevelopmentAllowed: !canonicalCompatible && !ciArtifact,
      updatesDocumentation: false,
    },
    finalControlledMemoryBytes: Math.max(0, ...perFixture.map((result) => result.finalControlledMemoryBytes ?? 0)),
    parallelExecution: {
      status: parallelAccepted ? "supported" : "experimental",
      builtInScenarioUsage: false,
      recallTolerance: 0.01,
      exactAccuracyTolerance: 0.01,
      ...(parallelAccepted ? {} : { reason: "Parallel comparison did not meet sequential correctness parity; built-in scenarios remain sequential." }),
    },
    fixtureCount: manifest.fixtures.length,
    positiveCases: manifest.fixtures.filter((fixture) => fixture.expectedOutcome === "decode").length,
    negativeCases: manifest.fixtures.filter((fixture) => fixture.expectedOutcome !== "decode").length,
    methodology: "Internal Node comparison over identical RGBA fixture bytes. Raw engines, Scanly preprocessing, and multi-engine orchestration are separate strategies; this is not a commercial third-party comparison.",
    strategies,
    perFixture,
  };
  const explicitOutput = process.argv.find((argument) => argument.startsWith("--output="))?.slice("--output=".length);
  const output = explicitOutput
    ? path.join(path.resolve(explicitOutput), "comparison.json")
    : path.join(root, "benchmark-results", canonicalCompatible ? "candidates" : ciArtifact ? "ci" : "development", "comparison.json");
  await fs.promises.mkdir(path.dirname(output), { recursive: true });
  await fs.promises.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(strategies, null, 2));
  console.log(`Wrote ${output}`);
  await Promise.all(runtimes.map((runtime) => runtime.router?.dispose() ?? runtime.rawEngine?.dispose?.() ?? Promise.resolve()));
  if (canonicalCompatible) {
    const failures = validateComparisonReport(report);
    if (failures.length) throw new Error(`Comparison candidate gates failed:\n- ${failures.join("\n- ")}`);
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
