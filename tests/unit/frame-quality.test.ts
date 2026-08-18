import { describe, expect, it } from "vitest";
import { FrameQualityAnalyzer } from "../../packages/browser/src/scanner/frame-quality";
import { createRgbaFrame } from "@scanly/core";
describe("FrameQualityAnalyzer contract", () => it("flags saturated input", () => { const image = new Uint8ClampedArray(4 * 4 * 4).fill(255); const q = new FrameQualityAnalyzer().analyze(createRgbaFrame(image, 4, 4)); expect(q.overexposed).toBe(true); expect(q.glareDominated).toBe(true); }));
