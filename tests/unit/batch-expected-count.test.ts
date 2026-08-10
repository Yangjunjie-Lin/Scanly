import { describe, expect, it } from "vitest";
import { BatchController } from "../../packages/browser/src/batch/batch-controller.js";
import type { BarcodeTrack, BarcodeTrackState } from "../../packages/browser/src/tracking/types.js";

function track(
  trackId: string,
  physicalInstanceId: string,
  state: BarcodeTrackState = "confirmed",
): BarcodeTrack {
  return {
    trackId,
    physicalInstanceId,
    payload: "012345678905",
    format: "upc_a",
    state,
    firstSeenAt: 0,
    lastSeenAt: 40,
    firstFrameId: 1,
    lastFrameId: 2,
    observationCount: state === "tentative" ? 1 : 2,
    missedFrameCount: 0,
    geometry: {
      cornerPoints: [{ x: 10, y: 10 }],
      boundingBox: { x: 10, y: 10, width: 20, height: 20 },
      frameWidth: 100,
      frameHeight: 100,
    },
  };
}

describe("expected-count batch mode", () => {
  it("completes from distinct confirmed physical tracks rather than event or track-id count", () => {
    const controller = new BatchController({ mode: "expected-count", expectedCount: 2 });
    const completed: string[] = [];
    controller.onEvent((event) => { if (event.type === "batch-completed") completed.push(event.type); });

    controller.applyTracks([track("track-a", "physical-a", "tentative")], 0);
    expect(controller.getState()).toMatchObject({ status: "collecting", confirmedPhysicalInstanceCount: 0 });

    controller.applyTracks([track("track-a", "physical-a")], 40);
    controller.applyTracks([track("track-a-fragment", "physical-a")], 80);
    controller.applyTracks([track("track-a", "physical-a")], 120);
    expect(controller.getState()).toMatchObject({ status: "collecting", confirmedPhysicalInstanceCount: 1 });

    controller.applyTracks([track("track-b", "physical-b")], 160);
    expect(controller.getState()).toMatchObject({ status: "complete", confirmedPhysicalInstanceCount: 2, completedAt: 160 });
    expect(completed).toHaveLength(1);
    expect(controller.getStatistics()).toMatchObject({ completionAccuracy: 1, batchCompletedEvents: 1 });
  });

  it("rejects invalid expected-count configuration", () => {
    expect(() => new BatchController({ mode: "expected-count" })).toThrow(/expectedCount/);
    expect(() => new BatchController({ mode: "expected-count", expectedCount: 1.5 })).toThrow(/positive integer/);
  });

  it("keeps continuous mode open and supports an optional unique-instance target", () => {
    const continuous = new BatchController({ mode: "continuous" });
    continuous.applyTracks([track("track-a", "physical-a"), track("track-b", "physical-b")], 10);
    expect(continuous.getState()).toMatchObject({ status: "collecting", confirmedPhysicalInstanceCount: 2 });

    const unique = new BatchController({ mode: "unique-physical-instance", expectedCount: 2 });
    unique.applyTracks([track("track-a", "physical-a"), track("track-a-repeat", "physical-a")], 10);
    expect(unique.getState()).toMatchObject({ status: "collecting", confirmedPhysicalInstanceCount: 1 });
    unique.applyTracks([track("track-b", "physical-b")], 20);
    expect(unique.getState()).toMatchObject({ status: "complete", confirmedPhysicalInstanceCount: 2 });
  });
});
