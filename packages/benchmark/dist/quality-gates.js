const HARD_ATTEMPT_LIMITS = {
    "14-damaged": 110,
    "16-multiple-codes": 30,
    "50-multiple-three": 70,
};
export function evaluateBenchmarkGates(summary, baseline, options) {
    const failures = [];
    const baselineRate = baseline.successRate ?? baseline.passed / baseline.total;
    const minimumRate = Math.max(0.98, baselineRate);
    if (summary.regressionCount > 0) {
        failures.push(`${summary.regressionCount} previously-passing fixture(s) regressed`);
    }
    if (summary.multipleCompleteness.complete !== summary.multipleCompleteness.total) {
        failures.push(`multiple completeness is ${summary.multipleCompleteness.complete}/${summary.multipleCompleteness.total}`);
    }
    if (options.fullSuite) {
        if (summary.passed < baseline.passed) {
            failures.push(`passed ${summary.passed}; absolute baseline is ${baseline.passed}`);
        }
        if (summary.successRate + Number.EPSILON < minimumRate) {
            failures.push(`success rate ${(summary.successRate * 100).toFixed(2)}% is below ${(minimumRate * 100).toFixed(2)}%`);
        }
        if (summary.averageAttempts > baseline.averageAttempts) {
            failures.push(`average attempts ${summary.averageAttempts.toFixed(1)} exceed baseline ${baseline.averageAttempts.toFixed(1)}`);
        }
        if (summary.p95Attempts > 100) {
            failures.push(`P95 attempts ${summary.p95Attempts.toFixed(1)} exceed 100`);
        }
        if (summary.averageMs > baseline.averageMs * 3) {
            failures.push(`average decode time exceeds 3× baseline`);
        }
        if (summary.p95Ms > baseline.p95Ms * 3) {
            failures.push(`P95 decode time exceeds 3× baseline`);
        }
    }
    for (const result of summary.results) {
        const limit = HARD_ATTEMPT_LIMITS[result.id];
        if (limit !== undefined && result.attemptCount > limit) {
            failures.push(`${result.id} used ${result.attemptCount} attempts; limit is ${limit}`);
        }
    }
    return failures;
}
//# sourceMappingURL=quality-gates.js.map