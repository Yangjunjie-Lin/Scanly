import { describe, expect, it } from "vitest";
import { BarcodeTracker, type BarcodeObservation } from "../../packages/browser/src/tracking/index";

function observation(x: number): BarcodeObservation {
  return { payload: "LIFE", format: "qr_code", geometry: { cornerPoints: [], boundingBox: { x, y: 5, width: 10, height: 10 }, frameWidth: 100, frameHeight: 100 } };
}

describe("track lifecycle", () => {
  it("moves tentative to confirmed to lost to retired without leaving live state", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 2, maxMissedFrames: 2 });
    const created = tracker.update([observation(10)], 1, 10);
    expect(created.newTracks[0]!.state).toBe("tentative");
    const confirmed = tracker.update([observation(12)], 2, 20);
    expect(confirmed.updatedTracks[0]!.state).toBe("confirmed");

    const lost = tracker.update([], 3, 30);
    expect(lost.lostTracks).toHaveLength(1);
    expect(lost.lostTracks[0]!.state).toBe("lost");
    expect(tracker.update([], 4, 40).lostTracks).toHaveLength(0);
    const retired = tracker.update([], 5, 50);
    expect(retired.retiredTracks).toHaveLength(1);
    expect(retired.retiredTracks[0]!.state).toBe("retired");
    expect(tracker.getTracks()).toEqual([]);
    expect(tracker.getStatistics()).toMatchObject({
      confirmedTrackCount: 1,
      lostTransitionCount: 1,
      retiredTrackCount: 1,
      activeTrackCount: 0,
      lostTrackCount: 0,
    });
  });

  it("clears all live and pending state on disposal", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    tracker.update([observation(10)], 1, 10);
    tracker.dispose();
    expect(tracker.size).toBe(0);
    expect(tracker.lostSize).toBe(0);
    expect(tracker.getStatistics()).toMatchObject({
      activeTrackCount: 0,
      pendingObservationCount: 0,
      associationP50Ms: 0,
      associationP95Ms: 0,
    });
  });
});
