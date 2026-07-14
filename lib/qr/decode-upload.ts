import { decodePixelBuffer } from "./decode-pipeline";
import { loadPixelBufferFromFile } from "./image-loader";
import type { DecodeOutcome, DecodePipelineOptions } from "./types";

export async function decodeUploadedFile(
  file: File,
  options: DecodePipelineOptions = {}
): Promise<DecodeOutcome> {
  try {
    options.onStage?.("Loading image…");
    const buffer = await loadPixelBufferFromFile(file);
    return await decodePixelBuffer(buffer, options);
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: string }).code)
        : "unsupported_image";
    const message = e instanceof Error ? e.message : String(e);
    const reason =
      code === "invalid_file" ||
      code === "unsupported_image" ||
      code === "empty_image"
        ? (code as "invalid_file" | "unsupported_image" | "empty_image")
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
