import { describe, expect, it } from "vitest";
import { candidateFingerprint, createCoordinateTransform, dedupeCandidates, createPixelBuffer, IDENTITY_MATRIX, type CandidateImage } from "@scanly/core/qr";

function cand(overrides: Partial<CandidateImage> & Pick<CandidateImage, "candidateIndex">): CandidateImage {
  const buf = createPixelBuffer(new Uint8ClampedArray(16), 2, 2);
  return {
    buffer: buf,
    candidateScore: 1,
    cropPadding: "medium",
    scale: "original",
    scaleFactor: 1,
    region: null,
    transform: createCoordinateTransform(IDENTITY_MATRIX, 2, 2, 2, 2),
    ...overrides,
  };
}

describe("candidate dedupe", () => {
  it("removes duplicate fingerprints", () => {
    const a = cand({ candidateIndex: 0 });
    const b = cand({ candidateIndex: 0 });
    const out = dedupeCandidates([a, b]);
    expect(out).toHaveLength(1);
  });

  it("keeps distinct regions", () => {
    const a = cand({ candidateIndex: 0, scale: "original" });
    const b = cand({ candidateIndex: 1, scale: "original" });
    expect(dedupeCandidates([a, b])).toHaveLength(2);
  });

  it("dedupes near-identical geometry produced by different plans", () => {
    const region = { x: 100, y: 80, width: 200, height: 200, score: 10, index: 0 };
    const a = cand({ candidateIndex: 0, cropPadding: "medium", region });
    const b = cand({
      candidateIndex: 0,
      cropPadding: "expanded",
      scale: "upscaled",
      scaleFactor: 1.35,
      region: { ...region, x: 102, y: 83 },
    });
    expect(dedupeCandidates([a, b])).toHaveLength(1);
  });

  it("fingerprint includes dimensions", () => {
    const big = createPixelBuffer(new Uint8ClampedArray(64), 4, 4);
    const c1 = cand({ candidateIndex: 0, buffer: big });
    const c2 = cand({ candidateIndex: 0 });
    expect(candidateFingerprint(c1)).not.toBe(candidateFingerprint(c2));
  });
});
