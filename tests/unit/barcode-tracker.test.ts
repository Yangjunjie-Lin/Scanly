import { describe, expect, it } from "vitest";
import { BarcodeTracker, TrackROISet, createTrackOverlayModels, type BarcodeObservation } from "../../packages/browser/src/tracking/index";

function observation(payload: string, x: number, y = 10): BarcodeObservation {
  return {
    payload,
    format: "upc_a",
    geometry: {
      cornerPoints: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }],
      boundingBox: { x, y, width: 10, height: 10 },
      frameWidth: 200,
      frameHeight: 100,
    },
  };
}

describe("BarcodeTracker", () => {
  it("bounds observations and live tracks and returns defensive snapshots", () => {
    const tracker = new BarcodeTracker({ maxTracks: 2, maxObservations: 3, confirmationObservations: 1 });
    const update = tracker.update([
      observation("A", 0), observation("B", 40), observation("C", 80), observation("D", 120),
    ], { frameId: 1, timestamp: 100 });

    expect(update.newTracks).toHaveLength(2);
    expect(update.ignoredObservationCount).toBe(2);
    expect(tracker.size).toBe(2);
    expect(tracker.getStatistics()).toMatchObject({
      receivedObservations: 4,
      consideredObservations: 3,
      ignoredObservations: 2,
      activeTrackCount: 2,
      peakTrackCount: 2,
      pendingObservationCount: 0,
    });

    update.tracks[0]!.geometry.boundingBox.x = 999;
    expect(tracker.getTracks()[0]!.geometry.boundingBox.x).toBe(0);
  });

  it("rejects incomplete duplicate frame updates and isolates malformed geometry", () => {
    const tracker = new BarcodeTracker();
    const malformed = observation("bad", 0);
    malformed.geometry.boundingBox.width = Number.NaN;
    const first = tracker.update([malformed], 1, 10);
    expect(first.tracks).toHaveLength(0);
    expect(first.ignoredObservationCount).toBe(1);
    expect(() => tracker.update([], 1, 11)).toThrow(/complete observation set/);
  });

  it("produces bounded predictive ROIs, periodic global recovery, and neutral overlays", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    tracker.update([observation("A", 10)], 1, 10);
    tracker.update([observation("A", 20)], 2, 20);
    const track = tracker.getTracks()[0]!;
    const rois = new TrackROISet({ maxROIs: 1, globalScanIntervalFrames: 3, uncoveredGridSize: 2 });

    const first = rois.plan([track], { frameId: 3, width: 200, height: 100 });
    const second = rois.plan([track], { frameId: 4, width: 200, height: 100 });
    const recovery = rois.plan([track], { frameId: 6, width: 200, height: 100 });
    expect(first.trackedROIs).toHaveLength(1);
    expect(first.trackedROIs[0]).toMatchObject({ trackId: track.trackId, predicted: true });
    expect(first.includeFullFrame).toBe(true);
    expect(second.includeFullFrame).toBe(false);
    expect(recovery.includeFullFrame).toBe(true);
    expect(first.uncoveredRegions.length).toBeLessThanOrEqual(4);

    const overlay = createTrackOverlayModels([track])[0]!;
    expect(overlay).toMatchObject({ trackId: track.trackId, payload: "A", state: "confirmed" });
    overlay.boundingBox.x = 999;
    expect(track.geometry.boundingBox.x).toBe(20);
  });

  it("hard-bounds ROI candidates, grid work, and uncovered output under extreme configuration", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 1 });
    tracker.update([observation("A", 10)], 1, 10);
    const source = tracker.getTracks()[0]!;
    const candidates = Array.from({ length: 128 }, (_, index) => ({
      ...source,
      trackId: `candidate-${index}`,
      physicalInstanceId: `physical-${index}`,
    }));
    Object.defineProperty(candidates, 128, {
      get(): never { throw new Error("TrackROISet inspected an out-of-bound candidate."); },
    });
    candidates.length = 1_000_000;

    const rois = new TrackROISet({
      maxCandidateTracks: Number.MAX_SAFE_INTEGER,
      maxROIs: Number.MAX_SAFE_INTEGER,
      uncoveredGridSize: Number.MAX_SAFE_INTEGER,
      maxUncoveredRegions: Number.MAX_SAFE_INTEGER,
    });
    const plan = rois.plan(candidates, { frameId: 2, width: 200, height: 100 });

    expect(plan.trackedROIs).toHaveLength(32);
    expect(plan.uncoveredRegions.length).toBeLessThanOrEqual(64);
    expect(plan.uncoveredRegions.every((region) =>
      [region.x, region.y, region.width, region.height].every(Number.isFinite),
    )).toBe(true);
  });
});
