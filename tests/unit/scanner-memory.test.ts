import { describe, expect, it } from "vitest";
import { ScannerSession } from "../../packages/browser/src/scanner/scanner-session";
import { DeterministicFrameSequenceSource } from "../../packages/browser/src/scanner/frame-source";
import { createRgbaFrame, sdkError, type ScanResult } from "@scanly/core";
import type { ScannerFrameDecoder } from "../../packages/browser/src/scanner/types";
describe("Scanner memory contract", () => it("does not retain an idle queue", () => { const s = new ScannerSession({ source: new DeterministicFrameSequenceSource(function* () {}) }); expect(s.getStatistics().pendingFrameCount).toBe(0); expect(s.getStatistics().finalControlledMemory).toBe(0); }));
it("drains a 10,000-frame Scanner Core Soak without claiming Worker evidence", async () => {
  const source = new DeterministicFrameSequenceSource(function* () { for (let i = 0; i < 10_000; i += 1) yield createRgbaFrame(new Uint8ClampedArray(8 * 8 * 4).fill(i % 2 ? 220 : 20), 8, 8, { id: `soak-${i}`, timestampMs: i, sourceType: "camera", ownership: "owned" }); });
  const decoder = { decode: async (frame: ReturnType<typeof createRgbaFrame>) => ({ ok: false as const, error: sdkError("no_symbol_found", "soak miss"), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 0 } }), cancel() {}, dispose() {}, getStatistics: () => ({ workerCreatedCount: 0, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 0 }) };
  const session = new ScannerSession({ source, decoder, quality: { sampleTarget: 256, blurThreshold: 0, contrastThreshold: 0 } });
  await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0)); const stats = session.getStatistics(); await session.dispose();
  expect(stats.capturedFrames).toBe(10_000); expect(stats.pendingFrameCount).toBe(0); expect(stats.activeDecodeCount).toBe(0); expect(stats.finalControlledMemory).toBe(0); expect(stats.workerCreatedCount).toBe(0);
});
it("counts temporal, repeat, and ROI state as controlled until stop drains it", async () => {
  let releaseSource!: () => void;
  const sourceGate = new Promise<void>((resolve) => { releaseSource = resolve; });
  const makeFrame = (index: number) => createRgbaFrame(new Uint8ClampedArray(16 * 16 * 4).fill(180), 16, 16, { id: `temporal-memory-${index}`, timestampMs: index, sourceType: "camera", ownership: "owned" });
  const source = new DeterministicFrameSequenceSource(async function* () { yield makeFrame(1); yield makeFrame(2); await sourceGate; });
  const decoder: ScannerFrameDecoder = {
    async decode(frame) {
      const result: ScanResult = { format: "qr_code", rawText: "TEMPORAL-MEMORY", cornerPoints: [{ x: 2, y: 2 }, { x: 12, y: 2 }, { x: 12, y: 12 }, { x: 2, y: 12 }], engine: { id: "jsqr", version: "test" }, preprocessingPath: [], frameId: frame.id, structuredPayload: null, validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 0 } };
      return { ok: true, results: [result], primary: result, frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 0 } };
    },
    cancel() {}, dispose() {},
    getStatistics: () => ({ workerCreatedCount: 0, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 0 }),
  };
  const session = new ScannerSession({ source, decoder, confirmation: { mode: "immediate" }, repeatPolicy: { mode: "once-per-session" }, quality: { underexposedThreshold: 0, overexposedThreshold: 1, blurThreshold: 0, contrastThreshold: 0, glareThreshold: 1 } });
  await session.start();
  while (session.getStatistics().decodeSuccesses < 2) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(session.getStatistics()).toMatchObject({ emittedEvents: 1, suppressedRepeats: 1 });
  expect(session.getStatistics().finalControlledMemory).toBeGreaterThan(0);
  releaseSource(); await source.finished();
  while (session.getState() !== "stopped") await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(session.getStatistics().finalControlledMemory).toBe(0);
  await session.dispose();
});
it("derives final controlled memory from live decoder resources even while idle or stopped", async () => {
  const resources = { currentBytes: 4_096, inputBytes: 128, activeTasks: 1, nativeResults: 1 };
  const decoder: ScannerFrameDecoder = {
    async decode(frame) { return { ok: false, error: sdkError("no_symbol_found", "unused"), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 0 } }; },
    cancel() {}, dispose() {},
    getStatistics: () => ({ workerCreatedCount: 1, workerTerminatedCount: 0, activeTaskCount: resources.activeTasks, peakActiveTaskCount: 1, wasmCurrentLinearMemoryBytes: resources.currentBytes, wasmInputAllocationBytes: resources.inputBytes, wasmActiveNativeResultCount: resources.nativeResults }),
  };
  const source = new DeterministicFrameSequenceSource(function* () {}); const session = new ScannerSession({ source, decoder });
  expect(session.getStatistics().finalControlledMemory).toBe(4_096);
  await session.start(); await source.finished(); await session.stop();
  expect(session.getState()).toBe("stopped"); expect(session.getStatistics().finalControlledMemory).toBe(4_096);
  resources.currentBytes = 0; resources.inputBytes = 0; resources.activeTasks = 0; resources.nativeResults = 0;
  expect(session.getStatistics().finalControlledMemory).toBe(0); await session.dispose();
});
