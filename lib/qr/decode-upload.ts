import { decodePixelBuffer } from "./decode-pipeline";
import { loadPixelBufferFromFile } from "./image-loader";
import type { DecodeOutcome, DecodePipelineOptions } from "./types";

function canUseWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

async function decodeViaWorker(
  buffer: Awaited<ReturnType<typeof loadPixelBufferFromFile>>,
  options: DecodePipelineOptions
): Promise<DecodeOutcome> {
  const { getDecodeWorkerClient, markDecodePath } = await import("./worker/worker-client");
  markDecodePath("worker");
  const client = getDecodeWorkerClient();

  if (options.signal) {
    const onAbort = () => client.cancel();
    options.signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await client.decode(buffer, options);
    } finally {
      options.signal.removeEventListener("abort", onAbort);
    }
  }

  return client.decode(buffer, options);
}

export async function decodeUploadedFile(
  file: File,
  options: DecodePipelineOptions = {}
): Promise<DecodeOutcome> {
  try {
    options.onStage?.("Loading image…");
    const buffer = await loadPixelBufferFromFile(file);

    if (canUseWorker() && !options.forceMainThread) {
      return decodeViaWorker(buffer, options);
    }

    if (typeof window !== "undefined") {
      const { markDecodePath } = await import("./worker/worker-client");
      markDecodePath("main-thread");
    }

    return decodePixelBuffer(buffer, options);
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "unsupported_image";
    const message = e instanceof Error ? e.message : String(e);
    const reason =
      code === "invalid_file" ||
      code === "unsupported_image" ||
      code === "empty_image" ||
      code === "image_too_large" ||
      code === "worker_error"
        ? (code as
            | "invalid_file"
            | "unsupported_image"
            | "empty_image"
            | "image_too_large"
            | "worker_error")
        : "unsupported_image";
    return {
      ok: false,
      reason,
      message,
      attempts: [],
      attemptCount: 0,
      elapsedMs: 0,
      cancelled: false,
    };
  }
}

/** Cancel any in-flight worker decode (browser upload mode). */
export async function cancelUploadedDecode(): Promise<void> {
  if (!canUseWorker()) return;
  const { getDecodeWorkerClient } = await import("./worker/worker-client");
  getDecodeWorkerClient().cancel();
}

/** Terminate the singleton worker when the upload UI unmounts. */
export async function disposeUploadedDecodeWorker(): Promise<void> {
  if (!canUseWorker()) return;
  const { disposeDecodeWorkerClient } = await import("./worker/worker-client");
  disposeDecodeWorkerClient();
}
