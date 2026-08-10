import { describe, expect, it } from "vitest";
import { isWorkerRequest, isWorkerResponse } from "@scanly/browser";
import { sdkError } from "@scanly/core";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const frame = { id: "frame", timestampMs: 1, width: 1, height: 1, rowStride: 4, pixelFormat: "rgba8888", orientation: 0, sourceType: "upload", buffer: new ArrayBuffer(4) };
const validFailure = {
  ok: false as const,
  error: sdkError("no_symbol_found", "No barcode found."),
  frameId: "f",
  scenarioId: "fast",
  attemptCount: 1,
  timing: { totalMs: 1 },
};
const validResult = {
  format: "qr_code" as const,
  rawText: "OK",
  engine: { id: "fake", version: "1" },
  preprocessingPath: [],
  frameId: "f",
  structuredPayload: null,
  validation: { valid: true, validatorIds: [], messages: [] },
  warnings: [],
  timing: { totalMs: 1 },
};

describe("Worker message validation", () => {
  it("accepts the bounded decode wire shape", () => {
    expect(isWorkerRequest({ type: "scan", jobId: "job-1", generation: 1, frame, scenario: getBuiltinScenario("fast"), progress: false })).toBe(true);
  });

  it.each([
    null,
    { type: "scan", jobId: "", generation: 1, frame: {}, scenario: {}, progress: false },
    { type: "scan", jobId: "job", generation: 1, frame: { ...frame, width: 0 }, scenario: getBuiltinScenario("fast"), progress: false },
    { type: "unknown", jobId: "job" },
  ])("rejects malformed requests", (message) => expect(isWorkerRequest(message)).toBe(false));

  it("rejects malformed responses before they reach ownership state", () => {
    expect(isWorkerResponse({ type: "progress", jobId: "job", generation: 1, attemptCount: -1 })).toBe(false);
    expect(isWorkerResponse({ type: "error", jobId: "job", generation: 1, message: 123 })).toBe(false);
    expect(isWorkerResponse({ type: "result", jobId: "job", generation: 1, outcome: { ok: false, frameId: "f", scenarioId: "fast" }, wasmMemory: { inputAllocationBytes: -1 } })).toBe(false);
    expect(isWorkerResponse({ type: "result", jobId: "job", generation: 1, outcome: validFailure })).toBe(true);
  });

  it.each([
    null,
    { ok: false, frameId: "f", scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 } },
    { ...validFailure, error: { code: "no_symbol_found" } },
    { ok: true, frameId: "f", scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 }, results: [null], primary: validResult },
    { ok: true, frameId: "f", scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 }, results: [{ ...validResult, rawText: null }], primary: validResult },
    { ok: true, frameId: "f", scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 }, results: [{ ...validResult, engine: null }], primary: validResult },
    { ok: true, frameId: "f", scenarioId: "fast", attemptCount: 1, timing: { totalMs: 1 }, results: [validResult], primary: { ...validResult, rawText: "OTHER" } },
  ])("rejects a malformed result outcome without throwing", (outcome) => {
    const response = { type: "result", jobId: "job", generation: 1, outcome };
    expect(() => isWorkerResponse(response)).not.toThrow();
    expect(isWorkerResponse(response)).toBe(false);
  });
});
