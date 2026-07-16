import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScanOutcome } from "@scanly/core";

const state = vi.hoisted(() => ({ scan: vi.fn(), start: vi.fn(), cancel: vi.fn(), dispose: vi.fn(), update: vi.fn() }));
vi.mock("../../packages/browser/src/browser-session", () => ({
  BrowserCaptureSession: class {
    start = state.start;
    scanFile = state.scan;
    cancel = state.cancel;
    dispose = state.dispose;
    updateConfiguration = state.update;
  },
}));
import { cancelUploadedDecode, decodeUploadedFile, disposeUploadedDecodeWorker } from "../../packages/browser/src/decode-upload";

const failure: ScanOutcome = { ok: false, error: { code: "no_symbol_found", category: "input", message: "none", retryable: true }, frameId: "f", scenarioId: "balanced", attemptCount: 0, timing: { totalMs: 1 } };

afterEach(async () => { await disposeUploadedDecodeWorker(); vi.clearAllMocks(); });

describe("deprecated upload wrapper", () => {
  it("delegates to BrowserCaptureSession instead of a private pipeline", async () => {
    state.scan.mockResolvedValue(failure);
    expect(await decodeUploadedFile({} as File, { forceMainThread: true })).toBe(failure);
    expect(state.start).toHaveBeenCalledOnce();
    expect(state.scan).toHaveBeenCalledWith({}, expect.objectContaining({ forceMainThread: true }));
  });

  it("reuses the session and routes scenario updates through validation", async () => {
    state.scan.mockResolvedValue(failure);
    await decodeUploadedFile({} as File);
    const scenario = (await import("@scanly/scenario-schema")).getBuiltinScenario("fast");
    await decodeUploadedFile({} as File, { scenario });
    expect(state.update).toHaveBeenCalledWith(scenario);
  });

  it("cancels and disposes the compatibility session", async () => {
    state.scan.mockResolvedValue(failure);
    await decodeUploadedFile({} as File);
    cancelUploadedDecode();
    expect(state.cancel).toHaveBeenCalledOnce();
    await disposeUploadedDecodeWorker();
    expect(state.dispose).toHaveBeenCalledOnce();
  });
});
