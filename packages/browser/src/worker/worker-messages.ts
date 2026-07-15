import type { DecodeOutcome, PipelineConfig } from "@scanly/core/qr";
import type { SerializedPixelBuffer } from "./transferable-buffer.js";

export type WorkerRequest =
  | {
      type: "decode";
      jobId: string;
      pixels: SerializedPixelBuffer;
      config?: Partial<PipelineConfig>;
    }
  | {
      type: "cancel";
      jobId: string;
    };

export type WorkerResponse =
  | { type: "stage"; jobId: string; stage: string }
  | { type: "progress"; jobId: string; attemptCount: number }
  | { type: "result"; jobId: string; outcome: DecodeOutcome }
  | { type: "cancelled"; jobId: string; elapsedMs: number }
  | { type: "error"; jobId: string; message: string };

function objectWithJobId(value: unknown): value is Record<string, unknown> & { jobId: string } {
  return Boolean(value) && typeof value === "object" && typeof (value as { jobId?: unknown }).jobId === "string" && (value as { jobId: string }).jobId.length > 0 && (value as { jobId: string }).jobId.length <= 128;
}

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!objectWithJobId(value) || (value.type !== "decode" && value.type !== "cancel")) return false;
  if (value.type === "cancel") return true;
  const pixels = value.pixels;
  if (!pixels || typeof pixels !== "object") return false;
  const candidate = pixels as { width?: unknown; height?: unknown; buffer?: unknown };
  return Number.isInteger(candidate.width) && (candidate.width as number) > 0 && Number.isInteger(candidate.height) && (candidate.height as number) > 0 && candidate.buffer instanceof ArrayBuffer;
}

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!objectWithJobId(value) || typeof value.type !== "string") return false;
  if (value.type === "stage") return typeof value.stage === "string" && value.stage.length <= 512;
  if (value.type === "progress") return Number.isInteger(value.attemptCount) && (value.attemptCount as number) >= 0;
  if (value.type === "cancelled") return typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0;
  if (value.type === "error") return typeof value.message === "string" && value.message.length <= 4_096;
  return value.type === "result" && Boolean(value.outcome) && typeof value.outcome === "object" && typeof (value.outcome as { ok?: unknown }).ok === "boolean";
}
