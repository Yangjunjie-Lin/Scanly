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

  it("bounds retired, unexpected, and duplicate retention during long-running collection", () => {
    const controller = new BatchController({
      mode: "checklist",
      expected: [
        { payload: "MATCH", format: "code_128" },
        { payload: "NEVER-SEEN", format: "data_matrix" },
      ],
      maxRetainedTracks: 4,
      maxRetainedPhysicalInstances: 4,
    });

    const matched = track("match", "MATCH", "code_128");
    controller.applyTracks([matched], 1);
    controller.applyTracks([{ ...matched, state: "retired" }], 2);
    for (let index = 0; index < 100; index += 1) {
      const snapshot = index % 2 === 0
        ? track(`duplicate-${index}`, "MATCH", "code_128")
        : track(`unexpected-${index}`, `OTHER-${index}`, "qr_code");
      controller.applyTracks([snapshot], 3 + index * 2);
      controller.applyTracks([{ ...snapshot, state: "retired" }], 4 + index * 2);
    }

    const state = controller.getState();
    const statistics = controller.getStatistics();
    expect(state.status).toBe("collecting");
    expect(controller.getTracks()).toHaveLength(0);
    expect(state.confirmedPhysicalInstanceCount).toBeLessThanOrEqual(4);
    expect(state.unexpected.length + state.duplicate.length).toBeLessThanOrEqual(3);
    expect(statistics).toMatchObject({
      retainedTrackCount: 0,
      retainedPhysicalInstanceCount: 4,
      peakRetainedTrackCount: 1,
      peakRetainedPhysicalInstanceCount: 4,
      trackRetiredEvents: 101,
    });
    expect(statistics.retentionRejectedPhysicalInstanceCount).toBeGreaterThan(0);

    controller.clear();
    expect(controller.getTracks()).toEqual([]);
    expect(controller.getStatistics()).toMatchObject({
      retainedTrackCount: 0,
      retainedPhysicalInstanceCount: 0,
      unexpectedQuantity: 0,
      duplicateQuantity: 0,
    });
  });

  it("rejects objectives and retention limits that cannot be bounded safely", () => {
    expect(() => new BatchController({
      mode: "checklist",
      expected: [{ payload: "A", quantity: 3 }],
      maxRetainedPhysicalInstances: 2,
    })).toThrow(/must cover the batch objective/);
    expect(() => new BatchController({ maxRetainedTracks: 0 })).toThrow(/maxRetainedTracks/);
    expect(() => new BatchController({ maxRetainedPhysicalInstances: 4_097 })).toThrow(/no greater than 4096/);
  });

  it("reserves bounded checklist capacity for late expected items", () => {
    const controller = new BatchController({
      mode: "checklist",
      expected: [
        { payload: "EXPECTED-A", format: "code_128" },
        { payload: "EXPECTED-B", format: "data_matrix" },
      ],
      maxRetainedPhysicalInstances: 2,
    });
    controller.applyTracks([track("noise", "NOISE", "qr_code")], 1);
    controller.applyTracks([track("a", "EXPECTED-A", "code_128")], 2);
    controller.applyTracks([track("b", "EXPECTED-B", "data_matrix")], 3);

    expect(controller.getState()).toMatchObject({
      status: "complete",
      confirmedPhysicalInstanceCount: 2,
      unexpected: [],
    });
    expect(controller.getState().matched.map(({ item }) => item.payload).sort()).toEqual(["EXPECTED-A", "EXPECTED-B"]);
    expect(controller.getStatistics()).toMatchObject({
      retainedPhysicalInstanceCount: 2,
      retentionEvictedPhysicalInstanceCount: 1,
      batchCompletedEvents: 1,
    });
  });
});
