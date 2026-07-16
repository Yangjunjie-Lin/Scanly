import { validateFrame, type ScanOutcome } from "@scanly/core";
import { validateScenario, type ScenarioDefinition } from "@scanly/scenario-schema";
import { fromTransferableFrame, type SerializedNormalizedFrame } from "./transferable-buffer.js";

export type WorkerRequest =
  | { type: "scan"; jobId: string; frame: SerializedNormalizedFrame; scenario: ScenarioDefinition; progress: boolean }
  | { type: "cancel"; jobId: string };

export type WorkerResponse =
  | { type: "stage"; jobId: string; stage: string }
  | { type: "progress"; jobId: string; attemptCount: number }
  | { type: "result"; jobId: string; outcome: ScanOutcome }
  | { type: "cancelled"; jobId: string; elapsedMs: number }
  | { type: "error"; jobId: string; message: string };

function objectWithJobId(value: unknown): value is Record<string, unknown> & { jobId: string } {
  return Boolean(value) && typeof value === "object" && typeof (value as { jobId?: unknown }).jobId === "string" && (value as { jobId: string }).jobId.length > 0 && (value as { jobId: string }).jobId.length <= 128;
}

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!objectWithJobId(value) || (value.type !== "scan" && value.type !== "cancel")) return false;
  if (value.type === "cancel") return true;
  if (typeof value.progress !== "boolean" || !value.frame || typeof value.frame !== "object" || !(value.frame as { buffer?: unknown }).buffer || !((value.frame as { buffer: unknown }).buffer instanceof ArrayBuffer)) return false;
  const frame = fromTransferableFrame(value.frame as SerializedNormalizedFrame);
  if (validateFrame(frame).length) return false;
  return validateScenario(value.scenario).ok;
}

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!objectWithJobId(value) || typeof value.type !== "string") return false;
  if (value.type === "stage") return typeof value.stage === "string" && value.stage.length <= 256;
  if (value.type === "progress") return Number.isInteger(value.attemptCount) && (value.attemptCount as number) >= 0;
  if (value.type === "cancelled") return typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0;
  if (value.type === "error") return typeof value.message === "string" && value.message.length <= 2_048;
  if (value.type !== "result" || !value.outcome || typeof value.outcome !== "object") return false;
  const outcome = value.outcome as Partial<ScanOutcome>;
  if (typeof outcome.ok !== "boolean" || typeof outcome.frameId !== "string" || outcome.frameId.length > 128 || typeof outcome.scenarioId !== "string" || outcome.scenarioId.length > 64) return false;
  return !outcome.ok || (Array.isArray(outcome.results) && outcome.results.length > 0 && outcome.results.length <= 64 && outcome.results.every((result) => result.rawText.length <= 65_536));
}
