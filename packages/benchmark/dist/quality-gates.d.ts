import type { BenchmarkRunSummary } from "./types.js";
export interface BenchmarkBaseline {
    total: number;
    passed: number;
    successRate?: number;
    averageMs: number;
    p95Ms: number;
    averageAttempts: number;
}
export declare function evaluateBenchmarkGates(summary: BenchmarkRunSummary, baseline: BenchmarkBaseline, options: {
    fullSuite: boolean;
}): string[];
//# sourceMappingURL=quality-gates.d.ts.map