import type { NormalizedFrame } from "../contracts/frame.js";
import type { BarcodeDifficultyDiagnosis, RecoveryQualityEvidence } from "./types.js";
export interface BarcodeDifficultyAnalyzerOptions {
    sampleTarget?: number;
}
/**
 * Bounded, deterministic routing analysis. The output is heuristic evidence,
 * not a Ground Truth annotation and not a claim that any route will decode.
 */
export declare class BarcodeDifficultyAnalyzer {
    private readonly options;
    constructor(options?: BarcodeDifficultyAnalyzerOptions);
    analyze(frame: NormalizedFrame, runtime?: RecoveryQualityEvidence): BarcodeDifficultyDiagnosis;
}
//# sourceMappingURL=difficulty-diagnosis.d.ts.map