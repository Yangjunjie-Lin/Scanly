import { describe, expect, it } from "vitest";
import { ScannerSession } from "../../packages/browser/src/scanner/scanner-session";
import { DeterministicFrameSequenceSource } from "../../packages/browser/src/scanner/frame-source";
import { createRgbaFrame, sdkError } from "@scanly/core";
import type { ScannerFrameDecoder } from "../../packages/browser/src/scanner/types";
describe("Scanner memory contract", () => it("does not retain an idle queue", () => { const s = new ScannerSession({ source: new DeterministicFrameSequenceSource(function* () {}) }); expect(s.getStatistics().pendingFrameCount).toBe(0); expect(s.getStatistics().finalControlledMemory).toBe(0); }));
it("drains a 10,000-frame Scanner Core Soak without claiming Worker evidence", async () => {
  const source = new DeterministicFrameSequenceSource(function* () { for (let i = 0; i < 10_000; i += 1) yield createRgbaFrame(new Uint8ClampedArray(8 * 8 * 4).fill(i % 2 ? 220 : 20), 8, 8, { id: `soak-${i}`, timestampMs: i, sourceType: "camera", ownership: "owned" }); });
  const decoder = { decode: async (frame: ReturnType<typeof createRgbaFrame>) => ({ ok: false as const, error: sdkError("no_symbol_found", "soak miss"), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 0 } }), cancel() {}, dispose() {}, getStatistics: () => ({ workerCreatedCount: 0, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 0 }) };
  const session = new ScannerSession({ source, decoder, quality: { sampleTarget: 256, blurThreshold: 0, contrastThreshold: 0 } });
  await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0)); const stats = session.getStatistics(); await session.dispose();
  expect(stats.capturedFrames).toBe(10_000); expect(stats.pendingFrameCount).toBe(0); expect(stats.activeDecodeCount).toBe(0); expect(stats.finalControlledMemory).toBe(0); expect(stats.workerCreatedCount).toBe(0);
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
