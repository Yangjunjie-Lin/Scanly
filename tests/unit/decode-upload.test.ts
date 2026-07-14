import { afterEach, describe, expect, it, vi } from "vitest";
import { createPixelBuffer } from "../../lib/qr/grayscale";

const {
  loadPixelBufferFromFile,
  decodePixelBuffer,
  workerDecode,
  workerCancel,
  workerDispose,
  markDecodePath,
} = vi.hoisted(() => ({
  loadPixelBufferFromFile: vi.fn(),
  decodePixelBuffer: vi.fn(),
  workerDecode: vi.fn(),
  workerCancel: vi.fn(),
  workerDispose: vi.fn(),
  markDecodePath: vi.fn(),
}));

vi.mock("../../lib/qr/image-loader", () => ({ loadPixelBufferFromFile }));
vi.mock("../../lib/qr/decode-pipeline", () => ({ decodePixelBuffer }));
vi.mock("../../lib/qr/worker/worker-client", () => ({
  getDecodeWorkerClient: () => ({ decode: workerDecode, cancel: workerCancel }),
  disposeDecodeWorkerClient: workerDispose,
  markDecodePath,
}));

import {
  cancelUploadedDecode,
  decodeUploadedFile,
  disposeUploadedDecodeWorker,
} from "../../lib/qr/decode-upload";

const file = {} as File;
const buffer = createPixelBuffer(new Uint8ClampedArray(16), 2, 2);
const failure = {
  ok: false as const,
  reason: "no_qr_found" as const,
  message: "none",
  attempts: [],
  attemptCount: 0,
  elapsedMs: 1,
  cancelled: false,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("upload decode wrapper", () => {
  it("uses the main-thread pipeline when explicitly requested", async () => {
    loadPixelBufferFromFile.mockResolvedValue(buffer);
    decodePixelBuffer.mockResolvedValue(failure);
    const outcome = await decodeUploadedFile(file, { forceMainThread: true });
    expect(outcome).toBe(failure);
    expect(decodePixelBuffer).toHaveBeenCalledWith(buffer, expect.any(Object));
  });

  it.each(["invalid_file", "unsupported_image", "empty_image", "image_too_large", "worker_error"] as const)(
    "preserves the %s application error reason",
    async (code) => {
      loadPixelBufferFromFile.mockRejectedValue(Object.assign(new Error(`failure: ${code}`), { code }));
      const outcome = await decodeUploadedFile(file);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe(code);
    }
  );

  it("uses, cancels, and disposes the browser worker client", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", class WorkerStub {});
    loadPixelBufferFromFile.mockResolvedValue(buffer);
    workerDecode.mockResolvedValue(failure);

    expect(await decodeUploadedFile(file)).toBe(failure);
    expect(workerDecode).toHaveBeenCalled();
    await cancelUploadedDecode();
    expect(workerCancel).toHaveBeenCalledOnce();
    await disposeUploadedDecodeWorker();
    expect(workerDispose).toHaveBeenCalledOnce();
  });

  it("forwards an in-flight AbortSignal to worker cancellation", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Worker", class WorkerStub {});
    loadPixelBufferFromFile.mockResolvedValue(buffer);
    let resolveWorker!: (value: typeof failure) => void;
    workerDecode.mockImplementation(() => new Promise((resolve) => { resolveWorker = resolve; }));
    const controller = new AbortController();
    const pending = decodeUploadedFile(file, { signal: controller.signal });
    await vi.waitFor(() => expect(workerDecode).toHaveBeenCalled());
    controller.abort();
    expect(workerCancel).toHaveBeenCalledOnce();
    resolveWorker(failure);
    await pending;
  });
});
