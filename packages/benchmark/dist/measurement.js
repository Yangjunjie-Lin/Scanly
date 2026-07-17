function median(values) {
    if (!values.length)
        return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function standardDeviation(values) {
    if (values.length < 2)
        return 0;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}
function distribution(values) {
    const sorted = [...values].sort((left, right) => left - right);
    return {
        average: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length),
        median: median(values),
        p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
    };
}
export function summarizeBenchmarkVariance(results) {
    const fixtureLatencies = results.map((result) => result.elapsedMs);
    const center = median(fixtureLatencies);
    return {
        perFixtureRunStdDevMs: distribution(results.map((result) => standardDeviation(result.runTimingsMs ?? []))),
        fixtureLatencySpreadMs: {
            standardDeviation: standardDeviation(fixtureLatencies),
            medianAbsoluteDeviation: median(fixtureLatencies.map((value) => Math.abs(value - center))),
        },
        suiteDurationMs: results.reduce((sum, result) => sum + (result.runTimingsMs ?? [result.elapsedMs]).reduce((subtotal, value) => subtotal + value, 0), 0),
    };
}
export function summarizeIterationCorrectness(results) {
    return {
        pass: results.length > 0 && results.every((result) => result.pass),
        iterationPassCount: results.filter((result) => result.pass).length,
        iterationFailureCount: results.filter((result) => !result.pass).length,
        unstablePayload: new Set(results.map((result) => JSON.stringify(result.allPayloads))).size > 1,
        runTimingsMs: results.map((result) => result.elapsedMs),
    };
}
//# sourceMappingURL=measurement.js.map