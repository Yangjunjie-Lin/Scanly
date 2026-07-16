import type { ScanResult } from "./result.js";
export interface ResultValidatorContext {
    readonly signal?: AbortSignal;
    readonly frameId: string;
    readonly scenarioId: string;
}
export interface ResultValidatorOutcome {
    valid: boolean;
    messages?: readonly string[];
}
export interface ResultValidator {
    readonly id: string;
    validate(result: Readonly<ScanResult>, context: ResultValidatorContext): ResultValidatorOutcome | Promise<ResultValidatorOutcome>;
}
//# sourceMappingURL=validator.d.ts.map