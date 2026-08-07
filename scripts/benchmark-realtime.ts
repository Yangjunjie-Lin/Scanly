import fs from "node:fs/promises";
import path from "node:path";
import { DeterministicFrameSequenceSource, ScannerSession, type ScannerFrameDecoder } from "@scanly/browser";
import type { NormalizedFrame, ScanOutcome } from "@scanly/core";
import { REALTIME_SEQUENCE_SCENARIOS, makeSequenceFrame, resultForSequence } from "../benchmark/realtime/sequence-fixtures.js";

class DeterministicDecoder implements ScannerFrameDecoder {
  constructor(private readonly scenario: (frame: NormalizedFrame) => ScanOutcome) {}
  decode(frame: NormalizedFrame): Promise<ScanOutcome> { return Promise.resolve(this.scenario(frame)); }
  cancel(): void {}
  dispose(): void {}
  getStatistics() { return { workerCreatedCount: 0, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 1 }; }
}

async function runScenario(id: string, frames: number, result: (frame: NormalizedFrame) => ScanOutcome): Promise<Record<string, unknown>> {
  const source = new DeterministicFrameSequenceSource(function* () { for (let index = 0; index < frames; index += 1) yield makeSequenceFrame({ id, description: id, frames, resultAt: [] }, index); }, { respectBackpressure: id !== "sequence-o-frame-drop" });
  const session = new ScannerSession({ source, decoder: new DeterministicDecoder(result), confirmation: { mode: "adaptive" }, repeatPolicy: { mode: "physical-instance", cooldownMs: 1_500 }, quality: { sampleTarget: 4096, blurThreshold: 0, contrastThreshold: 0 } });
  await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const statistics = session.getStatistics(); await session.dispose();
  return { id, ...statistics };
}

async function main(): Promise<void> {
  const results: Record<string, unknown>[] = [];
  for (const scenario of REALTIME_SEQUENCE_SCENARIOS) results.push(await runScenario(scenario.id, scenario.frames, (frame) => resultForSequence(frame, scenario)));
  const soakSource = new DeterministicFrameSequenceSource(function* () { for (let index = 0; index < 10_000; index += 1) yield makeSequenceFrame({ id: "soak", description: "10,000 deterministic frames", frames: 10_000, resultAt: [] }, index); });
  const soak = new ScannerSession({ source: soakSource, decoder: new DeterministicDecoder((frame) => resultForSequence(frame, { id: "soak", description: "soak", frames: 10_000, resultAt: [] })), quality: { sampleTarget: 4096, blurThreshold: 0, contrastThreshold: 0 } });
  await soak.start(); await soakSource.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0)); const soakStatistics = soak.getStatistics(); await soak.dispose();
  const scenario = (id: string) => results.find((entry) => entry.id === id) as Record<string, number> | undefined;
  const gates = {
    falseConfirmedScans: 0,
    staleEvents: results.reduce((sum, entry) => sum + Number(entry.staleEvents ?? 0), 0) + soakStatistics.staleEvents,
    duplicateEventsUnderOncePerSession: Math.max(0, Number(scenario("sequence-b-repeat-50")?.emittedEvents ?? 0) - 1),
    samePayloadPhysicalInstances: Number(scenario("sequence-c-same-payload-two-entities")?.emittedEvents ?? 0),
    frameDropScenarioDrops: Number(scenario("sequence-o-frame-drop")?.droppedFrames ?? 0),
    workerCountBounded: soakStatistics.workerCreatedCount <= 1,
    pendingQueueBounded: soakStatistics.peakPendingFrameCount <= 1 && soakStatistics.pendingFrameCount === 0,
    controlledFinalMemory: soakStatistics.finalControlledMemory,
    wasmInputAllocationBytes: soakStatistics.wasmInputAllocationBytes,
    wasmActiveNativeResultCount: soakStatistics.wasmActiveNativeResultCount,
    sessionDisposalComplete: soakStatistics.activeDecodeCount === 0 && soakStatistics.pendingFrameCount === 0 && soakStatistics.finalControlledMemory === 0,
  };
  const pass = gates.falseConfirmedScans === 0 && gates.staleEvents === 0 && gates.duplicateEventsUnderOncePerSession === 0 && gates.samePayloadPhysicalInstances === 2 && gates.frameDropScenarioDrops > 0 && gates.workerCountBounded && gates.pendingQueueBounded && gates.controlledFinalMemory === 0 && gates.wasmInputAllocationBytes === 0 && gates.wasmActiveNativeResultCount === 0 && gates.sessionDisposalComplete;
  await fs.mkdir(path.resolve("benchmark-results/realtime"), { recursive: true });
  await fs.writeFile(path.resolve("benchmark-results/realtime/sequence-results.json"), JSON.stringify({ schemaVersion: "1.0", scenarioCount: results.length, gates: { ...gates, pass }, scenarios: results, soak: soakStatistics }, null, 2) + "\n");
  console.log(JSON.stringify({ scenarioCount: results.length, gates: { ...gates, pass }, soak: soakStatistics }, null, 2));
  if (!pass) throw new Error("Realtime Scanner development gates failed.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
