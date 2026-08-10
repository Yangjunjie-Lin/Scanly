import { describe, expect, it } from "vitest";
import { BarcodeTracker, type BarcodeObservation } from "../../packages/browser/src/tracking/index";

function observation(x: number): BarcodeObservation {
  return { payload: "SAME", format: "upc_a", geometry: { cornerPoints: [], boundingBox: { x, y: 20, width: 10, height: 10 }, frameWidth: 200, frameHeight: 100 } };
}

describe("crossing tracks", () => {
  it("uses bounded motion evidence to keep same-payload identities through a crossing", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    const initial = tracker.update([observation(0), observation(100)], 1, 10).tracks;
    const leftToRightId = initial.find((track) => track.geometry.boundingBox.x === 0)!.trackId;
    const rightToLeftId = initial.find((track) => track.geometry.boundingBox.x === 100)!.trackId;

    tracker.update([observation(20), observation(80)], 2, 20);
    tracker.update([observation(45), observation(55)], 3, 30);
    const crossed = tracker.update([observation(70), observation(30)], 4, 40).tracks;

    expect(crossed.find((track) => track.trackId === leftToRightId)!.geometry.boundingBox.x).toBe(70);
    expect(crossed.find((track) => track.trackId === rightToLeftId)!.geometry.boundingBox.x).toBe(30);
    expect(new Set(crossed.map((track) => track.trackId)).size).toBe(2);
    expect(tracker.getStatistics()).toMatchObject({ createdTrackCount: 2, matchedObservationCount: 6 });
  });

  it("semantic compatibility prevents different-payload identity switches", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    const first = tracker.update([
      { ...observation(0), payload: "A" }, { ...observation(100), payload: "B" },
    ], 1, 10).tracks;
    const idA = first.find((track) => track.payload === "A")!.trackId;
    tracker.update([{ ...observation(45), payload: "A" }, { ...observation(55), payload: "B" }], 2, 20);
    const crossed = tracker.update([{ ...observation(80), payload: "A" }, { ...observation(20), payload: "B" }], 3, 30).tracks;
    expect(crossed.find((track) => track.payload === "A")!.trackId).toBe(idA);
  });
});
