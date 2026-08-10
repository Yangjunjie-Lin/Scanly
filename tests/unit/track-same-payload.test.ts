import { describe, expect, it } from "vitest";
import { BarcodeTracker, type BarcodeObservation } from "../../packages/browser/src/tracking/index";

function product(x: number, y: number): BarcodeObservation {
  return {
    payload: "012345678905",
    format: "upc_a",
    geometry: { cornerPoints: [], boundingBox: { x, y, width: 12, height: 8 }, frameWidth: 240, frameHeight: 120 },
  };
}

describe("same payload physical instances", () => {
  it("creates distinct identities and keeps them stable while they move independently", () => {
    const tracker = new BarcodeTracker({ confirmationObservations: 2 });
    const tentative = tracker.update([product(10, 10), product(180, 70)], 1, 10).tracks;
    expect(tentative).toHaveLength(2);
    expect(new Set(tentative.map((track) => track.trackId)).size).toBe(2);
    expect(new Set(tentative.map((track) => track.physicalInstanceId)).size).toBe(2);

    const original = new Map(tentative.map((track) => [track.geometry.boundingBox.x < 100 ? "A" : "B", track.trackId]));
    const confirmed = tracker.update([product(25, 12), product(165, 60)], 2, 20).tracks;
    expect(confirmed.every((track) => track.state === "confirmed")).toBe(true);
    const moved = tracker.update([product(40, 16), product(150, 45)], 3, 30).tracks;

    expect(moved.find((track) => track.geometry.boundingBox.x === 40)!.trackId).toBe(original.get("A"));
    expect(moved.find((track) => track.geometry.boundingBox.x === 150)!.trackId).toBe(original.get("B"));
    expect(new Set(moved.map((track) => track.payload))).toEqual(new Set(["012345678905"]));
  });
});
