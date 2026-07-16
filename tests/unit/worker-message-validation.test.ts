import { describe, expect, it } from "vitest";
import { isWorkerRequest, isWorkerResponse } from "@scanly/browser";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const frame = { id: "frame", timestampMs: 1, width: 1, height: 1, rowStride: 4, pixelFormat: "rgba8888", orientation: 0, sourceType: "upload", buffer: new ArrayBuffer(4) };

describe("Worker message validation", () => {
  it("accepts the bounded decode wire shape", () => {
    expect(isWorkerRequest({ type: "scan", jobId: "job-1", frame, scenario: getBuiltinScenario("fast"), progress: false })).toBe(true);
  });

  it.each([
    null,
    { type: "scan", jobId: "", frame: {}, scenario: {}, progress: false },
    { type: "scan", jobId: "job", frame: { ...frame, width: 0 }, scenario: getBuiltinScenario("fast"), progress: false },
    { type: "unknown", jobId: "job" },
  ])("rejects malformed requests", (message) => expect(isWorkerRequest(message)).toBe(false));

  it("rejects malformed responses before they reach ownership state", () => {
    expect(isWorkerResponse({ type: "progress", jobId: "job", attemptCount: -1 })).toBe(false);
    expect(isWorkerResponse({ type: "error", jobId: "job", message: 123 })).toBe(false);
    expect(isWorkerResponse({ type: "result", jobId: "job", outcome: { ok: false, frameId: "f", scenarioId: "fast" } })).toBe(true);
  });
});
