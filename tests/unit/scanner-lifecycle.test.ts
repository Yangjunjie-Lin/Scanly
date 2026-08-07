import { describe, expect, it } from "vitest";
import { ScannerSession } from "../../packages/browser/src/scanner/scanner-session";
import { DeterministicFrameSequenceSource } from "../../packages/browser/src/scanner/frame-source";
import type { CameraFrameSource } from "../../packages/browser/src/scanner/types";
describe("ScannerSession lifecycle contract", () => it("starts idle", () => { const s = new ScannerSession({ source: new DeterministicFrameSequenceSource(function* () {}) }); expect(s.getState()).toBe("idle"); }));
it("switches a running camera source without retaining the old source", async () => {
  class Source implements CameraFrameSource { starts = 0; stops = 0; async start(): Promise<void> { this.starts += 1; } stop(): void { this.stops += 1; } }
  const first = new Source(); const second = new Source(); const session = new ScannerSession({ source: first });
  await session.start(); expect(session.getState()).toBe("scanning"); await session.switchSource(second); expect(first.stops).toBe(1); expect(second.starts).toBe(1); expect(session.getState()).toBe("scanning"); await session.stop();
});
