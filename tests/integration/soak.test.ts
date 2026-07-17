import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodePixelBufferWithNodeEngines as decodePixelBuffer } from "@scanly/node";
import { CaptureSession } from "@scanly/core";
import { createNodeCaptureRouter, loadPixelBufferFromPath } from "@scanly/node";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const root = path.resolve(__dirname, "../..");

describe("long-running reliability", () => {
  it("decodes the same image 500 times without state leaking between calls", async () => {
    const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures/51-gamma-ish.png"));
    for (let index = 0; index < 500; index++) {
      const outcome = await decodePixelBuffer(pixels, { config: { findMultiple: false, maxCandidates: 2, maxAttempts: 18, decoders: { order: ["jsqr"], execution: "sequential" } } });
      expect(outcome.ok, `iteration ${index}`).toBe(true);
      if (outcome.ok) expect(outcome.primary.payload).toBe("SCANLY_GAMMA_01");
    }
  }, 180_000);

  it("supports 500 repeated session create, start, stop, and dispose cycles", async () => {
    for (let index = 0; index < 500; index++) {
      const session = new CaptureSession();
      session.initialize();
      session.start(index % 2 ? "camera" : "upload");
      session.cancel();
      session.stop();
      session.start("upload");
      session.stop();
      await session.dispose();
      expect(session.getState()).toBe("disposed");
    }
  });

  it("supports 500 scenario switches while preserving a running session", async () => {
    const router = createNodeCaptureRouter({ scenario: getBuiltinScenario("fast") });
    const session = new CaptureSession({ router, disposeRouter: true });
    session.start("upload");
    for (let index = 0; index < 500; index++) {
      session.updateConfiguration(getBuiltinScenario(index % 2 ? "balanced" : "fast"));
      expect(session.getState()).toBe("running");
    }
    await session.dispose();
  });

  it("alternates successful and invalid images without retaining failure state", async () => {
    const pixels = await loadPixelBufferFromPath(path.join(root, "fixtures/51-gamma-ish.png"));
    for (let index = 0; index < 20; index++) {
      const input = index % 2 === 0 ? pixels : { width: 2, height: 2, data: new Uint8ClampedArray(4) };
      const outcome = await decodePixelBuffer(input, { config: { findMultiple: false, maxCandidates: 2, maxAttempts: 18, decoders: { order: ["jsqr"], execution: "sequential" } } });
      expect(outcome.ok, `iteration ${index}`).toBe(index % 2 === 0);
    }
  });
});
