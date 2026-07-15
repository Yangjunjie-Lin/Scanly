import { afterEach, describe, expect, it, vi } from "vitest";
import { createPixelBuffer } from "@scanly/core/qr";
import { getBuiltinScenario } from "@scanly/scenario-schema";

const { loadPixelBufferFromFile, decodePixelBuffer } = vi.hoisted(() => ({
  loadPixelBufferFromFile: vi.fn(),
  decodePixelBuffer: vi.fn(),
}));

vi.mock("../../packages/browser/src/image-loader", () => ({ loadPixelBufferFromFile }));
vi.mock("@scanly/core/qr", async (importOriginal) => ({ ...(await importOriginal()), decodePixelBuffer }));

import { BrowserCaptureSession } from "../../packages/browser/src/browser-session";

const file = {} as File;
const pixels = createPixelBuffer(new Uint8ClampedArray(16), 2, 2);
const success = {
  ok: true as const,
  results: [{ payload: "HELLO", decoder: "jsqr" as const, preprocessing: "original" as const, candidateIndex: 0, scale: "original" as const, rotation: 0 as const, cropPadding: "full" as const, attemptIndex: 0, foundAtMs: 1 }],
  primary: { payload: "HELLO", decoder: "jsqr" as const, preprocessing: "original" as const, candidateIndex: 0, scale: "original" as const, rotation: 0 as const, cropPadding: "full" as const, attemptIndex: 0, foundAtMs: 1 },
  attempts: [],
  attemptCount: 1,
  elapsedMs: 2,
  timeToFirstResultMs: 1,
  cancelled: false,
};

afterEach(() => vi.clearAllMocks());

describe("BrowserCaptureSession", () => {
  it("rejects malformed constructor configuration before creating a session", () => {
    const scenario = { ...getBuiltinScenario("balanced"), output: undefined };
    expect(() => new BrowserCaptureSession({ scenario: scenario as never })).toThrow(/output/);
  });

  it("enforces start and maps main-thread legacy results into the public API", async () => {
    const session = new BrowserCaptureSession();
    const beforeStart = await session.scanFile(file, { forceMainThread: true });
    expect(beforeStart.ok).toBe(false);
    if (!beforeStart.ok) expect(beforeStart.error.code).toBe("session_not_running");
    session.initialize();
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    decodePixelBuffer.mockResolvedValue(success);
    const outcome = await session.scanFile(file, { forceMainThread: true });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.primary.rawText).toBe("HELLO");
    session.stop();
    session.dispose();
    session.dispose();
  });

  it("returns a typed file-input failure", async () => {
    const session = new BrowserCaptureSession();
    session.start();
    loadPixelBufferFromFile.mockRejectedValue(Object.assign(new Error("too large"), { code: "image_too_large" }));
    const outcome = await session.scanFile(file, { forceMainThread: true });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.code).toBe("resource_limit_exceeded");
  });

  it("rejects concurrent work under the reject policy", async () => {
    const session = new BrowserCaptureSession({ concurrentCallPolicy: "reject" });
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    let resolve!: (value: typeof success) => void;
    decodePixelBuffer.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const first = session.scanFile(file, { forceMainThread: true });
    await vi.waitFor(() => expect(decodePixelBuffer).toHaveBeenCalled());
    const rejected = await session.scanFile(file, { forceMainThread: true });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error.code).toBe("concurrent_call_rejected");
    resolve(success);
    await first;
  });

  it("cancels superseded work and rejects malformed configuration/disposed use", async () => {
    const session = new BrowserCaptureSession();
    session.start();
    loadPixelBufferFromFile.mockResolvedValue(pixels);
    let resolve!: (value: typeof success) => void;
    decodePixelBuffer.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const pending = session.scanFile(file, { forceMainThread: true });
    await vi.waitFor(() => expect(decodePixelBuffer).toHaveBeenCalled());
    session.cancel();
    resolve(success);
    const cancelled = await pending;
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) expect(cancelled.error.code).toBe("cancelled");
    const invalid = getBuiltinScenario("balanced") as unknown as { schemaVersion: string };
    invalid.schemaVersion = "1.0";
    expect(() => session.updateConfiguration(invalid as never)).toThrow(/schemaVersion/);
    session.dispose();
    const disposed = await session.scanFile(file);
    expect(disposed.ok).toBe(false);
    if (!disposed.ok) expect(disposed.error.code).toBe("session_disposed");
    expect(() => session.start()).toThrow(/disposed/);
  });
});
