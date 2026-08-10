import { describe, expect, it } from "vitest";
import { BatchController } from "../../packages/browser/src/batch/batch-controller.js";
import type { BarcodeTrack } from "../../packages/browser/src/tracking/types.js";

function product(index: number, physicalInstanceId = `physical-${index}`): BarcodeTrack {
  return {
    trackId: `track-${index}`,
    physicalInstanceId,
    payload: "012345678905",
    format: "upc_a",
    state: "confirmed",
    firstSeenAt: index,
    lastSeenAt: index,
    firstFrameId: index,
    lastFrameId: index,
    observationCount: 2,
    missedFrameCount: 0,
    geometry: {
      cornerPoints: [{ x: index * 10, y: 0 }],
      boundingBox: { x: index * 10, y: 0, width: 8, height: 8 },
      frameWidth: 100,
      frameHeight: 100,
    },
  };
}

describe("checklist duplicate quantity", () => {
  it("allocates quantity by physical instance and classifies only quota overflow as duplicate", () => {
    const controller = new BatchController({
      mode: "checklist",
      expected: [{ payload: "012345678905", format: "upc_a", quantity: 3 }],
    });
    const eventTypes: string[] = [];
    controller.onEvent((event) => eventTypes.push(event.type));

    controller.applyTracks([product(1)], 1);
    controller.applyTracks([product(1, "physical-1")], 2);
    controller.applyTracks([product(2), product(3)], 3);
    expect(controller.getState()).toMatchObject({ status: "complete", confirmedPhysicalInstanceCount: 3 });
    expect(controller.getState().matched).toHaveLength(3);
    expect(controller.getState().duplicate).toHaveLength(0);

    controller.applyTracks([product(4)], 4);
    const state = controller.getState();
    expect(state.confirmedPhysicalInstanceCount).toBe(4);
    expect(state.matched).toHaveLength(3);
    expect(state.duplicate.map((entry) => entry.physicalInstanceId)).toEqual(["physical-4"]);
    expect(state.unexpected).toHaveLength(0);
    expect(eventTypes.filter((type) => type === "item-matched")).toHaveLength(3);
    expect(eventTypes.filter((type) => type === "duplicate-item")).toHaveLength(1);
    expect(eventTypes.filter((type) => type === "batch-completed")).toHaveLength(1);
    expect(controller.getStatistics()).toMatchObject({ matchedQuantity: 3, duplicateQuantity: 1, completionAccuracy: 1 });
  });
});
