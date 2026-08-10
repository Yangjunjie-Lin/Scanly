import type { NormalizedFrame } from "@scanly/core";
import type { FrameQuality } from "./types.js";
export interface FrameQualityAnalyzerOptions {
    sampleTarget?: number;
    underexposedThreshold?: number;
    overexposedThreshold?: number;
    blurThreshold?: number;
    contrastThreshold?: number;
    glareThreshold?: number;
}
/** Low-cost luminance/gradient quality analysis; no ML model or retained frame buffer. */
export declare class FrameQualityAnalyzer {
    private readonly options;
    private previous;
    private previousShape;
    constructor(options?: FrameQualityAnalyzerOptions);
    analyze(frame: NormalizedFrame): FrameQuality;
    reset(): void;
    private luminance;
}
//# sourceMappingURL=frame-quality.d.ts.map