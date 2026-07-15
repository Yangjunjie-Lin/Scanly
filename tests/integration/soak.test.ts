import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePixelBuffer } from "@scanly/core/qr";
import { CaptureSession } from "@scanly/core";
import { loadPixelBufferFromPath } from "@scanly/core/node";

const root = path.resolve(__dirname, "../..");

describe("long-running reliability", () => {
  it("decodes the same image 100 times without state leaking between calls", async () => {
    const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures/51-gamma-ish.png"));
    for (let index = 0; index < 100; index++) {
      const outcome = await decodePixelBuffer(pixels, { config: { findMultiple: false, maxCandidates: 2, maxAttempts: 18, decoders: { jsqr: true, zxing: false } } });
      expect(outcome.ok, `iteration ${index}`).toBe(true);
      if (outcome.ok) expect(outcome.primary.payload).toBe("SCANLY_GAMMA_01");
    }
  }, 60_000);

  it("supports 100 repeated session create, cancel, and dispose cycles", () => {
    for (let index = 0; index < 100; index++) {
      const session = new CaptureSession();
      session.initialize();
      session.start(index % 2 ? "camera" : "upload");
      session.cancel();
      session.cancel();
      session.dispose();
      expect(session.getState()).toBe("disposed");
    }
  });

  it("alternates successful and invalid images without retaining failure state", async () => {
    const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures/51-gamma-ish.png"));
    for (let index = 0; index < 20; index++) {
      const input = index % 2 === 0 ? pixels : { width: 2, height: 2, data: new Uint8ClampedArray(4) };
      const outcome = await decodePixelBuffer(input, { config: { findMultiple: false, maxCandidates: 2, maxAttempts: 18, decoders: { jsqr: true, zxing: false } } });
      expect(outcome.ok, `iteration ${index}`).toBe(index % 2 === 0);
    }
  });
});
