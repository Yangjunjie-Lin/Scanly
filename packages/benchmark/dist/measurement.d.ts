import type { BenchmarkFixtureResult, BenchmarkVariance } from "./types.js";
export declare function standardDeviation(values: number[]): number;
export declare function summarizeBenchmarkVariance(results: Array<Pick<BenchmarkFixtureResult, "elapsedMs" | "runTimingsMs">>): BenchmarkVariance;
export declare function summarizeIterationCorrectness(results: Array<Pick<BenchmarkFixtureResult, "pass" | "allPayloads" | "elapsedMs">>): {
    pass: boolean;
    iterationPassCount: number;
    iterationFailureCount: number;
    unstablePayload: boolean;
    runTimingsMs: number[];
};
//# sourceMappingURL=measurement.d.ts.map