import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRgbaFrame } from "@scanly/core";
import { rotateBuffer } from "@scanly/core/qr";
import { createNodeCaptureRouter, loadPixelBufferFromPath } from "@scanly/node";
import { getBuiltinScenario } from "@scanly/scenario-schema";

describe("CaptureRouter orientation contract", () => {
  it.each([0, 90, 180, 270] as const)("decodes a real QR from source metadata %s", async (orientation) => {
    const upright = await loadPixelBufferFromPath(path.resolve("fixtures/01-clear-url.png"));
    const sourceRotation = orientation === 0 ? 0 : ((360 - orientation) % 360) as 90 | 180 | 270;
    const source = rotateBuffer(upright, sourceRotation);
    const router = createNodeCaptureRouter({ scenario: getBuiltinScenario("balanced") });
    try {
      const outcome = await router.scan(createRgbaFrame(source.data, source.width, source.height, { orientation, sourceType: "upload" }));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.primary.rawText).toBe("https://scanly.example/clear");
      expect(outcome.primary.cornerPoints?.every((point) => point.x >= 0 && point.y >= 0 && point.x < upright.width && point.y < upright.height)).toBe(true);
    } finally {
      await router.dispose();
    }
  }, 15_000);
});
