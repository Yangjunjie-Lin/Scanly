import { describe, expect, it } from "vitest";
import { createCoordinateTransform, createPixelBuffer, decodePixelBuffer, dedupeResults, IDENTITY_MATRIX, type CandidateImage, type DecodedCode, type PipelineEngineExecutor } from "@scanly/core/qr";

function candidate(): CandidateImage {
  return {
    buffer: createPixelBuffer(new Uint8ClampedArray(100 * 100 * 4), 100, 100),
    candidateIndex: 0, candidateScore: 1, cropPadding: "full", scale: "full", scaleFactor: 1, region: null,
    transform: createCoordinateTransform(IDENTITY_MATRIX, 100, 100, 100, 100),
  };
}

function code(payload: string, x: number, attemptIndex: number): DecodedCode {
  return {
    payload, format: "qr_code", decoder: "fake", preprocessing: "original", candidateIndex: 0,
    scale: "full", rotation: 0, cropPadding: "full", attemptIndex,
    cornerPoints: [{ x, y: 10 }, { x: x + 10, y: 10 }, { x: x + 10, y: 20 }, { x, y: 20 }],
  };
}

describe("multi-code result collection", () => {
  it.each([5, 8])("collects %i results without a hidden ceiling", async (count) => {
    const executor: PipelineEngineExecutor = {
      engineIds: ["fake"],
      decode: async () => ({ ok: true, results: Array.from({ length: count }, (_, index) => ({
        text: `CODE_${index}`, format: "qr_code" as const, elapsedMs: 1,
        cornerPoints: [{ x: index * 10, y: 0 }, { x: index * 10 + 5, y: 0 }, { x: index * 10 + 5, y: 5 }, { x: index * 10, y: 5 }],
      })) as never }),
    };
    const outcome = await decodePixelBuffer(candidate().buffer, {
      candidates: [candidate()], engineExecutor: executor,
      config: { decoders: { order: ["fake"], execution: "sequential" }, findMultiple: true, maxMultipleResults: count, expectedResultCount: count, maxAttempts: 10 },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.results).toHaveLength(count);
  });

  it("preserves separate same-payload symbols and merges overlapping attempts", () => {
    const results = dedupeResults([code("SAME", 10, 0), code("SAME", 60, 1), code("SAME", 11, 2)]);
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.cornerPoints?.[0].x)).toEqual([10, 60]);
  });
});
