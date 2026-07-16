import type { DecodeAttempt, DecodeOutcome, DecodePipelineOptions, DecodeSuccess, DecodedCode, PixelBuffer, PreprocessMethod, PhaseTiming, RotationDegrees } from "./types.js";
import { type CandidateImage } from "./candidate-generation.js";
export declare function buildAttemptPlan(preprocessOrder: PreprocessMethod[], rotations: RotationDegrees[], budgetRemaining: number): Array<{
    preprocessing: PreprocessMethod;
    rotation: RotationDegrees;
}>;
export declare function orderCandidates(candidates: CandidateImage[], findMultiple: boolean): CandidateImage[];
/**
 * Breadth-first decode pipeline with dedupe, adaptive multiple stop, and fail-fast.
 */
export declare function decodePixelBuffer(image: PixelBuffer, options?: DecodePipelineOptions): Promise<DecodeOutcome>;
export declare function successOutcome(results: DecodedCode[], attempts: DecodeAttempt[], start: number, cancelled: boolean, phaseTiming: PhaseTiming): DecodeSuccess;
//# sourceMappingURL=decode-pipeline.d.ts.map