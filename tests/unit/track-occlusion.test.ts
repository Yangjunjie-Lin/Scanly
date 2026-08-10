import { describe, expect, it } from "vitest";
import { BarcodeTracker, type BarcodeObservation } from "../../packages/browser/src/tracking/index";

function observation(x: number): BarcodeObservation {
  return { payload: "OCCLUDED", format: "data_matrix", geometry: { cornerPoints: [], boundingBox: { x, y: 20, width: 10, height: 10 }, frameWidth: 200, frameHeight: 100 } };
}

describe("bounded occlusion recovery", () => {
  it("restores the same confirmed track and physical identity inside the grace window", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 2, maxMissedFrames: 4 });
    tracker.update([observation(10)], 1, 10);
    const confirmed = tracker.update([observation(20)], 2, 20).tracks[0]!;
    tracker.update([], 3, 30);
    tracker.update([], 4, 40);
    const restored = tracker.update([observation(50)], 5, 50);

    expect(restored.newTracks).toHaveLength(0);
    expect(restored.restoredTracks).toHaveLength(1);
    expect(restored.restoredTracks[0]).toMatchObject({
      trackId: confirmed.trackId,
      physicalInstanceId: confirmed.physicalInstanceId,
      state: "confirmed",
      missedFrameCount: 0,
      observationCount: 3,
    });
  });

  it("creates a new identity after the prior track has retired", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 1, maxMissedFrames: 1 });
    const first = tracker.update([observation(10)], 1, 10).tracks[0]!;
    tracker.update([], 2, 20);
    tracker.update([], 3, 30);
    const reentered = tracker.update([observation(10)], 4, 40).newTracks[0]!;
    expect(reentered.trackId).not.toBe(first.trackId);
    expect(reentered.physicalInstanceId).not.toBe(first.physicalInstanceId);
  });
});
