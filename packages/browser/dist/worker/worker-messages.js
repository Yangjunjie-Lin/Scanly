import { validateFrame } from "@scanly/core";
import { validateScenario } from "@scanly/scenario-schema";
import { fromTransferableFrame } from "./transferable-buffer.js";
function objectWithJobId(value) {
    return Boolean(value) && typeof value === "object" && typeof value.jobId === "string" && value.jobId.length > 0 && value.jobId.length <= 128;
}
export function isWorkerRequest(value) {
    if (!objectWithJobId(value) || (value.type !== "scan" && value.type !== "cancel"))
        return false;
    if (value.type === "cancel")
        return true;
    if (typeof value.progress !== "boolean" || !value.frame || typeof value.frame !== "object" || !value.frame.buffer || !(value.frame.buffer instanceof ArrayBuffer))
        return false;
    const frame = fromTransferableFrame(value.frame);
    if (validateFrame(frame).length)
        return false;
    return validateScenario(value.scenario).ok;
}
export function isWorkerResponse(value) {
    if (!objectWithJobId(value) || typeof value.type !== "string")
        return false;
    if (value.type === "stage")
        return typeof value.stage === "string" && value.stage.length <= 256;
    if (value.type === "progress")
        return Number.isInteger(value.attemptCount) && value.attemptCount >= 0;
    if (value.type === "cancelled")
        return typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0;
    if (value.type === "error")
        return typeof value.message === "string" && value.message.length <= 2_048;
    if (value.type !== "result" || !value.outcome || typeof value.outcome !== "object")
        return false;
    const outcome = value.outcome;
    if (typeof outcome.ok !== "boolean" || typeof outcome.frameId !== "string" || outcome.frameId.length > 128 || typeof outcome.scenarioId !== "string" || outcome.scenarioId.length > 64)
        return false;
    return !outcome.ok || (Array.isArray(outcome.results) && outcome.results.length > 0 && outcome.results.length <= 64 && outcome.results.every((result) => result.rawText.length <= 65_536));
}
//# sourceMappingURL=worker-messages.js.map