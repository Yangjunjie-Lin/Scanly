import { describe, expect, it } from "vitest";
import { BatchController } from "../../packages/browser/src/batch/batch-controller.js";
import type { BarcodeTrack } from "../../packages/browser/src/tracking/types.js";

function track(id: string, payload: string, format: BarcodeTrack["format"]): BarcodeTrack {
  return {
    trackId: `track-${id}`,
    physicalInstanceId: `physical-${id}`,
    payload,
    format,
    state: "confirmed",
    firstSeenAt: 0,
    lastSeenAt: 0,
    firstFrameId: 1,
    lastFrameId: 1,
    observationCount: 2,
    missedFrameCount: 0,
    geometry: {
      cornerPoints: [{ x: 0, y: 0 }],
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
      frameWidth: 100,
      frameHeight: 100,
    },
  };
}

describe("checklist batch mode", () => {
  it("reports matched, missing and unexpected instances with format-aware matching", () => {
    const controller = new BatchController({
      mode: "checklist",
      expected: [
        { payload: "ABC-001", format: "code_128" },
        { payload: "XYZ", format: "data_matrix" },
      ],
    });
    const eventTypes: string[] = [];
    controller.onEvent((event) => eventTypes.push(event.type));

    controller.applyTracks([
      track("abc", "ABC-001", "code_128"),
      track("wrong-format", "XYZ", "qr_code"),
      track("other", "OTHER", "qr_code"),
    ], 10);
    let state = controller.getState();
    expect(state.status).toBe("collecting");
    expect(state.matched.map((entry) => entry.item.payload)).toEqual(["ABC-001"]);
    expect(state.missing).toEqual([{ item: { payload: "XYZ", format: "data_matrix", quantity: 1 }, quantity: 1 }]);
    expect(state.unexpected.map((entry) => entry.physicalInstanceId)).toEqual(["physical-wrong-format", "physical-other"]);

    controller.applyTracks([track("xyz", "XYZ", "data_matrix")], 20);
    state = controller.getState();
    expect(state).toMatchObject({ status: "complete", completedAt: 20 });
    expect(state.missing).toEqual([]);
    expect(state.matched).toHaveLength(2);
    expect(eventTypes.filter((type) => type === "item-matched")).toHaveLength(2);
    expect(eventTypes.filter((type) => type === "unexpected-item")).toHaveLength(2);
    expect(eventTypes.filter((type) => type === "batch-completed")).toHaveLength(1);
  });

  it("rejects an empty checklist", () => {
    expect(() => new BatchController({ mode: "checklist", expected: [] })).toThrow(/at least one/);
  });
});
