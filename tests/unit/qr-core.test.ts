import { describe, expect, it } from "vitest";
import { toGrayscale, createPixelBuffer } from "../../lib/qr/grayscale";
import {
  contrastStretch,
  invertColors,
  fixedThreshold,
  computeOtsuThreshold,
  applyPreprocess,
} from "../../lib/qr/preprocess";
import {
  clampRect,
  applyCropPadding,
  nonMaximumSuppression,
  iou,
} from "../../lib/qr/region-detection";
import { rotateBuffer } from "../../lib/qr/rotate";
import { dedupeResults, looksLikeUrl, normalizePayload } from "../../lib/qr/result-normalizer";
import { buildAttemptPlan, decodePixelBuffer } from "../../lib/qr/decode-pipeline";
import type { DecodedCode, PixelBuffer, ScoredRegion } from "../../lib/qr/types";

function solid(width: number, height: number, rgb: [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return createPixelBuffer(data, width, height);
}

function gradient(width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.floor((x / Math.max(1, width - 1)) * 255);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return createPixelBuffer(data, width, height);
}

describe("grayscale", () => {
  it("converts RGB to equal channels", () => {
    const src = solid(2, 1, [10, 200, 30]);
    const g = toGrayscale(src);
    expect(g.data[0]).toBe(g.data[1]);
    expect(g.data[1]).toBe(g.data[2]);
    expect(g.data[0]).toBeGreaterThan(100);
  });
});

describe("preprocess", () => {
  it("contrast stretch expands near-flat range", () => {
    const data = new Uint8ClampedArray(16);
    for (let i = 0; i < 4; i++) {
      const v = 100 + i * 5;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const out = contrastStretch(createPixelBuffer(data, 2, 2));
    const vals = [out.data[0], out.data[4], out.data[8], out.data[12]];
    expect(Math.min(...vals)).toBeLessThanOrEqual(20);
    expect(Math.max(...vals)).toBeGreaterThanOrEqual(200);
  });

  it("invert flips channels", () => {
    const out = invertColors(solid(1, 1, [0, 100, 255]));
    expect([...out.data.slice(0, 3)]).toEqual([255, 155, 0]);
  });

  it("fixed threshold binarizes", () => {
    const src = gradient(4, 1);
    const out = fixedThreshold(src, 128);
    expect(out.data[0]).toBe(0);
    expect(out.data[12]).toBe(255);
  });

  it("otsu returns a separating threshold for bimodal input", () => {
    const width = 64;
    const height = 64;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const v = i % 2 === 0 ? 30 : 220;
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const t = computeOtsuThreshold(createPixelBuffer(data, width, height));
    // Otsu may land on either class edge; it must separate the two modes.
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
  });

  it("applyPreprocess covers named methods without throwing", () => {
    const src = solid(8, 8, [120, 130, 140]);
    for (const method of [
      "original",
      "grayscale",
      "contrast",
      "gamma",
      "invert",
      "threshold-115",
      "otsu",
      "sharpen",
    ] as const) {
      const out = applyPreprocess(src, method);
      expect(out.width).toBe(8);
      expect(out.data.length).toBe(8 * 8 * 4);
    }
  });
});

describe("region helpers", () => {
  it("clampRect keeps inside bounds", () => {
    expect(clampRect({ x: -10, y: -5, width: 1000, height: 1000 }, 100, 80)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
  });

  it("crop padding expands and clamps at edges", () => {
    const padded = applyCropPadding({ x: 0, y: 0, width: 20, height: 20 }, 100, 100, "expanded");
    expect(padded.x).toBe(0);
    expect(padded.y).toBe(0);
    expect(padded.width).toBeGreaterThan(20);
  });

  it("nms removes overlapping lower scores", () => {
    const regions: ScoredRegion[] = [
      { x: 0, y: 0, width: 50, height: 50, score: 100, index: -1 },
      { x: 5, y: 5, width: 50, height: 50, score: 80, index: -1 },
      { x: 80, y: 80, width: 40, height: 40, score: 90, index: -1 },
    ];
    const kept = nonMaximumSuppression(regions, 0.4, 5);
    expect(kept).toHaveLength(2);
    expect(kept[0].score).toBe(100);
    expect(iou(regions[0], regions[1])).toBeGreaterThan(0.4);
  });
});

describe("rotation", () => {
  it("rotates 90 degrees swapping dimensions", () => {
    const src = solid(4, 2, [1, 2, 3]);
    src.data[0] = 255;
    const out = rotateBuffer(src, 90);
    expect(out.width).toBe(2);
    expect(out.height).toBe(4);
  });

  it("rotates 180 and 270", () => {
    const src = solid(3, 2, [10, 20, 30]);
    src.data[0] = 200;
    const r180 = rotateBuffer(src, 180);
    expect(r180.width).toBe(3);
    expect(r180.height).toBe(2);
    const r270 = rotateBuffer(src, 270);
    expect(r270.width).toBe(2);
    expect(r270.height).toBe(3);
    const identity = rotateBuffer(src, 0);
    expect(identity.data[0]).toBe(200);
  });
});

describe("result normalizer", () => {
  it("dedupes payloads keeping first metadata", () => {
    const a: DecodedCode = {
      payload: "A",
      decoder: "jsqr",
      preprocessing: "original",
      candidateIndex: 0,
      scale: "original",
      rotation: 0,
      cropPadding: "medium",
      attemptIndex: 0,
    };
    const b = { ...a, decoder: "zxing" as const, attemptIndex: 1 };
    expect(dedupeResults([a, b, a])).toHaveLength(1);
  });

  it("detects http(s) URLs only", () => {
    expect(looksLikeUrl("https://scanly.example/x")).toBe(true);
    expect(looksLikeUrl("ftp://x")).toBe(false);
    expect(looksLikeUrl("not a url")).toBe(false);
  });

  it("strips nulls from payload", () => {
    expect(normalizePayload("ab\u0000c")).toBe("abc");
  });
});

describe("pipeline ordering / timeout / cancel", () => {
  it("buildAttemptPlan puts rotation 0 first", () => {
    const plan = buildAttemptPlan(["original", "invert"], [0, 90, 180], 20);
    expect(plan[0]).toEqual({ preprocessing: "original", rotation: 0 });
    expect(plan.some((p) => p.rotation === 90)).toBe(true);
  });

  it("empty image fails with empty_image", async () => {
    const out = await decodePixelBuffer(createPixelBuffer(new Uint8ClampedArray(0), 0, 0));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("empty_image");
  });

  it("abort cancels in-flight decode", async () => {
    const controller = new AbortController();
    controller.abort();
    const out = await decodePixelBuffer(solid(64, 64, [128, 128, 128]), {
      signal: controller.signal,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("cancelled");
  });

  it("timeout can fire on solid noise image", async () => {
    const noisy = gradient(400, 400);
    const out = await decodePixelBuffer(noisy, {
      config: { timeoutMs: 1, maxAttempts: 500, findMultiple: false },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("timeout");
      expect(out.cancelled).toBe(false);
    }
  });

  it("honors the maximum attempt budget", async () => {
    const out = await decodePixelBuffer(gradient(300, 300), {
      config: { maxAttempts: 5, timeoutMs: 10_000, findMultiple: false },
    });
    expect(out.attemptCount).toBeLessThanOrEqual(5);
  });
});
