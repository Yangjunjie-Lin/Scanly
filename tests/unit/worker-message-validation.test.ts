import { describe, expect, it } from "vitest";
import { isWorkerRequest, isWorkerResponse } from "@scanly/browser";

describe("Worker message validation", () => {
  it("accepts the bounded decode wire shape", () => {
    expect(isWorkerRequest({ type: "decode", jobId: "job-1", pixels: { width: 1, height: 1, buffer: new ArrayBuffer(4) } })).toBe(true);
  });

  it.each([
    null,
    { type: "decode", jobId: "", pixels: {} },
    { type: "decode", jobId: "job", pixels: { width: 0, height: 1, buffer: new ArrayBuffer(0) } },
    { type: "unknown", jobId: "job" },
  ])("rejects malformed requests", (message) => expect(isWorkerRequest(message)).toBe(false));

  it("rejects malformed responses before they reach ownership state", () => {
    expect(isWorkerResponse({ type: "progress", jobId: "job", attemptCount: -1 })).toBe(false);
    expect(isWorkerResponse({ type: "error", jobId: "job", message: 123 })).toBe(false);
    expect(isWorkerResponse({ type: "result", jobId: "job", outcome: { ok: false } })).toBe(true);
  });
});
