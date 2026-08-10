import { describe, expect, it } from "vitest";
import { associateTracks, calculateAssociationCost, type BarcodeObservation, type BarcodeTrack } from "../../packages/browser/src/tracking/index";

function geometry(x: number, width = 10) {
  return { cornerPoints: [], boundingBox: { x, y: 0, width, height: 10 }, frameWidth: 200, frameHeight: 100 };
}
function track(id: string, payload: string, x: number): BarcodeTrack {
  return { trackId: id, physicalInstanceId: `physical-${id}`, payload, format: "code_128", state: "confirmed", firstSeenAt: 0, lastSeenAt: 0, firstFrameId: 1, lastFrameId: 1, observationCount: 2, missedFrameCount: 0, geometry: geometry(x) };
}
function observed(payload: string, x: number, width = 10): BarcodeObservation {
  return { payload, format: "code_128", geometry: geometry(x, width) };
}

describe("track association", () => {
  it("considers semantic, spatial, IoU, size, prediction, and time terms", () => {
    const source = { ...track("1", "A", 10), velocity: { x: 10, y: 0 }, missedFrameCount: 2 };
    const predicted = calculateAssociationCost(source, observed("A", 40), 4);
    const wrongPayload = calculateAssociationCost(source, observed("B", 40), 4);
    const wrongFormat = calculateAssociationCost(source, { ...observed("A", 40), format: "qr_code" }, 4);
    const wrongSize = calculateAssociationCost(source, observed("A", 40, 40), 4);
    expect(predicted).toBeLessThan(wrongPayload);
    expect(predicted).toBeLessThan(wrongFormat);
    expect(predicted).toBeLessThan(wrongSize);
  });

  it("uses a global one-to-one bounded assignment with explicit unmatched tracks", () => {
    const tracks = [track("1", "A", 0), track("2", "A", 80), track("3", "C", 150)];
    const result = associateTracks(tracks, [observed("A", 10), observed("A", 70)], 2);
    expect(result.matches.map((match) => [match.trackIndex, match.observationIndex])).toEqual([[0, 0], [1, 1]]);
    expect(result.unmatchedTrackIndices).toEqual([2]);
    expect(result.unmatchedObservationIndices).toEqual([]);
    expect(result.costMatrix).toHaveLength(3);
    expect(result.costMatrix.every((row) => row.length === 2)).toBe(true);
  });

  it("does not associate an over-threshold distant observation", () => {
    const result = associateTracks([track("1", "A", 0)], [observed("A", 180)], 2);
    expect(result.matches).toEqual([]);
    expect(result.unmatchedTrackIndices).toEqual([0]);
    expect(result.unmatchedObservationIndices).toEqual([0]);
  });
});
