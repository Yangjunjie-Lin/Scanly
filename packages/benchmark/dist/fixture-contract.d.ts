import type { BenchmarkFixture } from "./types.js";
export interface FixtureEvaluation {
    pass: boolean;
    missingPayloads: string[];
    unexpectedPayloads: string[];
}
export declare function expectedPayloads(fixture: BenchmarkFixture): string[];
export declare function requiredPayloads(fixture: BenchmarkFixture): string[];
export declare function evaluateFixture(fixture: BenchmarkFixture, payloads: string[], actual: boolean | {
    ok: boolean;
    errorCode?: string;
}): FixtureEvaluation;
//# sourceMappingURL=fixture-contract.d.ts.map