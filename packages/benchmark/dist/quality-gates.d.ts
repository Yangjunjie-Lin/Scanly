import type { BenchmarkRunSummary } from "./types.js";
export interface BenchmarkBaseline {
    total: number;
    passed: number;
    successRate?: number;
    averageMs: number;
    medianMs: number;
    p95Ms: number;
    averageAttempts: number;
    p95Attempts: number;
    decodeRecall: number;
    exactPayloadAccuracy: number;
    falsePositiveCount: number;
    falsePositiveRate: number;
    timeoutCount: number;
    multipleCompleteness: {
        total: number;
        complete: number;
    };
    runtime?: BenchmarkRunSummary["runtime"];
    environment?: BenchmarkRunSummary["environment"];
}
export declare function evaluateBenchmarkGates(summary: BenchmarkRunSummary, baseline: BenchmarkBaseline, options: {
    fullSuite: boolean;
}): string[];
//# sourceMappingURL=quality-gates.d.ts.map