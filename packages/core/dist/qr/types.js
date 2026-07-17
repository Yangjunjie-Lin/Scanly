export const DEFAULT_PIPELINE_CONFIG = {
    maxCandidates: 5,
    maxAttempts: 96,
    timeoutMs: 12_000,
    maxPixels: 4_000_000,
    previewSize: 400,
    findMultiple: true,
    maxMultipleResults: 8,
    resultDeduplication: "payload-format-spatial",
    scales: [1, 0.7, 1.35],
    paddings: ["medium", "expanded", "tight"],
    rotations: [0, 90, 180, 270],
    preprocessOrder: [
        "original",
        "contrast",
        "invert",
        "otsu",
        "threshold-140",
        "gamma",
        "sharpen",
        "threshold-115",
        "threshold-165",
    ],
    decoders: { order: [], execution: "sequential", failurePolicy: "success-wins" },
    stallCandidateLimit: 12,
    failFastAfterAttempts: 48,
    enableLocalization: true,
    enableFullImageFallback: true,
    enableSplitImageFallback: true,
    enableGridImageFallback: true,
    maxIntermediateAllocations: 24,
    maxIntermediateBytes: 64 * 1024 * 1024,
};
export function validatePipelineConfig(config) {
    const issues = [];
    for (const key of ["maxCandidates", "maxAttempts", "timeoutMs", "maxPixels", "previewSize", "maxMultipleResults", "maxIntermediateAllocations", "maxIntermediateBytes"]) {
        const value = config[key];
        if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1)
            issues.push(`${key} must be a positive integer.`);
    }
    if (config.scales.length === 0 || config.scales.some((scale) => !Number.isFinite(scale) || scale <= 0 || scale > 4))
        issues.push("scales must contain finite values greater than 0 and at most 4.");
    if (config.paddings.length === 0)
        issues.push("paddings must not be empty.");
    if (config.rotations.length === 0)
        issues.push("rotations must not be empty.");
    if (config.preprocessOrder.length === 0)
        issues.push("preprocessOrder must not be empty.");
    if (!Array.isArray(config.decoders.order) || config.decoders.order.length === 0)
        issues.push("decoders.order must contain at least one registered engine id.");
    if (config.decoders.execution !== "sequential" && config.decoders.execution !== "parallel")
        issues.push("decoders.execution must be sequential or parallel.");
    if (config.multiCodeStallPolicy) {
        if (!Number.isInteger(config.multiCodeStallPolicy.maximumAttemptsWithoutNewResult) || config.multiCodeStallPolicy.maximumAttemptsWithoutNewResult < 1)
            issues.push("multiCodeStallPolicy.maximumAttemptsWithoutNewResult must be a positive integer.");
        if (!Number.isFinite(config.multiCodeStallPolicy.minimumCandidateCoverageBeforeStop) || config.multiCodeStallPolicy.minimumCandidateCoverageBeforeStop < 0 || config.multiCodeStallPolicy.minimumCandidateCoverageBeforeStop > 1)
            issues.push("multiCodeStallPolicy.minimumCandidateCoverageBeforeStop must be between 0 and 1.");
        if (typeof config.multiCodeStallPolicy.requireAllPrimaryCandidatesVisited !== "boolean")
            issues.push("multiCodeStallPolicy.requireAllPrimaryCandidatesVisited must be boolean.");
    }
    return issues;
}
//# sourceMappingURL=types.js.map