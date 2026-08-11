import { describe, expect, it } from "vitest";
import { getBuiltinScenario } from "@scanly/core";
import { isWorkerRequest } from "../../packages/browser/src/worker/worker-messages.js";

function request(recovery: unknown) {
  return {
    type: "scan", jobId: "industrial-job", generation: 1,
    frame: { id: "f", timestampMs: 0, width: 2, height: 2, rowStride: 8, pixelFormat: "rgba8888", orientation: 0, sourceType: "camera", ownership: "transferred", buffer: new ArrayBuffer(16) },
    scenario: getBuiltinScenario("fast"), progress: false, recovery,
  };
}

describe("industrial Worker contract", () => {
  it("accepts a bounded recovery request for Worker execution", () => {
    expect(isWorkerRequest(request({
      profile: "fast", sourceMode: "camera", dpmExperimental: false,
      budget: { maximumRoutes: 1, maximumAttempts: 1, maximumPixelsProcessed: 8, maximumTemporaryBytes: 64 },
    }))).toBe(true);
  });

  it("rejects unbounded or implicit DPM Worker requests", () => {
    expect(isWorkerRequest(request({ profile: "dpm", sourceMode: "camera", dpmExperimental: true }))).toBe(false);
    expect(isWorkerRequest(request({ profile: "fast", sourceMode: "camera", dpmExperimental: false, budget: { maximumRoutes: 0, maximumAttempts: 1, maximumPixelsProcessed: 8 } }))).toBe(false);
  });
});
