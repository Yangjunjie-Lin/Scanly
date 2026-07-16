const HARD_ATTEMPT_LIMITS = { "14-damaged": 110, "16-multiple-codes": 30, "50-multiple-three": 70 };
const TIMING_TOLERANCE = 1.5;
export function evaluateBenchmarkGates(summary, baseline, options) {
    const failures = [];
    if (summary.regressionCount > 0)
        failures.push(`${summary.regressionCount} previously-passing fixture(s) regressed`);
    if (summary.environment.scenario !== "fast" && summary.multipleCompleteness.complete !== summary.multipleCompleteness.total)
        failures.push(`multiple completeness is ${summary.multipleCompleteness.complete}/${summary.multipleCompleteness.total}`);
    if (summary.falsePositiveCount > 0)
        failures.push(`${summary.falsePositiveCount} false positive(s) detected`);
    if (summary.timeoutCount > 0)
        failures.push(`${summary.timeoutCount} benchmark timeout(s) detected`);
    if (summary.engineInitializationFailures > 0)
        failures.push(`${summary.engineInitializationFailures} engine initialization failure(s)`);
    if (summary.cancellationCorrectness.passed !== summary.cancellationCorrectness.total)
        failures.push(`cancellation correctness is ${summary.cancellationCorrectness.passed}/${summary.cancellationCorrectness.total}`);
    if (options.fullSuite) {
        if (!baseline.environment || !baseline.runtime)
            failures.push("baseline lacks required environment metadata");
        else {
            const compatible = baseline.environment.scenario === summary.environment.scenario
                && baseline.environment.datasetManifestHash === summary.environment.datasetManifestHash
                && baseline.runtime.kind === summary.runtime.kind
                && baseline.runtime.platform === summary.runtime.platform
                && baseline.runtime.arch === summary.runtime.arch
                && baseline.runtime.nodeVersion?.split(".")[0] === summary.runtime.nodeVersion?.split(".")[0];
            if (!compatible)
                failures.push("benchmark environment is incompatible with the selected immutable baseline");
        }
        if (summary.passed < baseline.passed)
            failures.push(`passed ${summary.passed}; baseline is ${baseline.passed}`);
        if (summary.decodeRecall + Number.EPSILON < baseline.decodeRecall)
            failures.push(`decode recall ${(summary.decodeRecall * 100).toFixed(2)}% is below baseline ${(baseline.decodeRecall * 100).toFixed(2)}%`);
        if (summary.exactPayloadAccuracy + Number.EPSILON < baseline.exactPayloadAccuracy)
            failures.push(`exact payload accuracy ${(summary.exactPayloadAccuracy * 100).toFixed(2)}% is below baseline`);
        if (summary.falsePositiveRate > baseline.falsePositiveRate || summary.falsePositiveCount > baseline.falsePositiveCount)
            failures.push("false-positive rate/count exceed baseline");
        if (summary.multipleCompleteness.complete < baseline.multipleCompleteness.complete)
            failures.push("multiple-code completeness is below baseline");
        if (summary.averageAttempts > baseline.averageAttempts * 1.15)
            failures.push(`average attempts ${summary.averageAttempts.toFixed(1)} exceed baseline tolerance`);
        if (summary.p95Attempts > Math.max(baseline.p95Attempts, 100))
            failures.push(`P95 attempts ${summary.p95Attempts.toFixed(1)} exceed profile limit`);
        if (summary.averageMs > baseline.averageMs * TIMING_TOLERANCE)
            failures.push(`average latency exceeds ${TIMING_TOLERANCE}x baseline`);
        if (summary.medianMs > baseline.medianMs * TIMING_TOLERANCE)
            failures.push(`median latency exceeds ${TIMING_TOLERANCE}x baseline`);
        if (summary.p95Ms > baseline.p95Ms * TIMING_TOLERANCE)
            failures.push(`P95 latency exceeds ${TIMING_TOLERANCE}x baseline`);
    }
    for (const result of summary.results) {
        const limit = HARD_ATTEMPT_LIMITS[result.id];
        if (limit !== undefined && result.attemptCount > limit)
            failures.push(`${result.id} used ${result.attemptCount} attempts; limit is ${limit}`);
    }
    return failures;
}
//# sourceMappingURL=quality-gates.js.map