function objectWithJobId(value) {
    return Boolean(value) && typeof value === "object" && typeof value.jobId === "string" && value.jobId.length > 0 && value.jobId.length <= 128;
}
export function isWorkerRequest(value) {
    if (!objectWithJobId(value) || (value.type !== "decode" && value.type !== "cancel"))
        return false;
    if (value.type === "cancel")
        return true;
    const pixels = value.pixels;
    if (!pixels || typeof pixels !== "object")
        return false;
    const candidate = pixels;
    return Number.isInteger(candidate.width) && candidate.width > 0 && Number.isInteger(candidate.height) && candidate.height > 0 && candidate.buffer instanceof ArrayBuffer;
}
export function isWorkerResponse(value) {
    if (!objectWithJobId(value) || typeof value.type !== "string")
        return false;
    if (value.type === "stage")
        return typeof value.stage === "string" && value.stage.length <= 512;
    if (value.type === "progress")
        return Number.isInteger(value.attemptCount) && value.attemptCount >= 0;
    if (value.type === "cancelled")
        return typeof value.elapsedMs === "number" && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0;
    if (value.type === "error")
        return typeof value.message === "string" && value.message.length <= 4_096;
    return value.type === "result" && Boolean(value.outcome) && typeof value.outcome === "object" && typeof value.outcome.ok === "boolean";
}
//# sourceMappingURL=worker-messages.js.map