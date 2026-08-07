import { describe, expect, it } from "vitest";
import { ScannerSession } from "../../packages/browser/src/scanner/scanner-session";
import { DeterministicFrameSequenceSource } from "../../packages/browser/src/scanner/frame-source";
import { createRgbaFrame, sdkError } from "@scanly/core";
describe("Scanner memory contract", () => it("does not retain an idle queue", () => { const s = new ScannerSession({ source: new DeterministicFrameSequenceSource(function* () {}) }); expect(s.getStatistics().pendingFrameCount).toBe(0); expect(s.getStatistics().finalControlledMemory).toBe(0); }));
it("drains a 10,000-frame deterministic soak", async () => {
  const source = new DeterministicFrameSequenceSource(function* () { for (let i = 0; i < 10_000; i += 1) yield createRgbaFrame(new Uint8ClampedArray(8 * 8 * 4).fill(i % 2 ? 220 : 20), 8, 8, { id: `soak-${i}`, timestampMs: i, sourceType: "camera", ownership: "owned" }); });
  const decoder = { decode: async (frame: ReturnType<typeof createRgbaFrame>) => ({ ok: false as const, error: sdkError("no_symbol_found", "soak miss"), frameId: frame.id, scenarioId: "fast", attemptCount: 1, timing: { totalMs: 0 } }), cancel() {}, dispose() {}, getStatistics: () => ({ workerCreatedCount: 1, workerTerminatedCount: 0, activeTaskCount: 0, peakActiveTaskCount: 1 }) };
  const session = new ScannerSession({ source, decoder, quality: { sampleTarget: 256, blurThreshold: 0, contrastThreshold: 0 } });
  await session.start(); await source.finished(); await new Promise<void>((resolve) => setTimeout(resolve, 0)); const stats = session.getStatistics(); await session.dispose();
  expect(stats.capturedFrames).toBe(10_000); expect(stats.pendingFrameCount).toBe(0); expect(stats.activeDecodeCount).toBe(0); expect(stats.finalControlledMemory).toBe(0);
});
