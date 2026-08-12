import type { NormalizedFrame } from "../contracts/frame.js";
import type { BarcodeCandidateRegion } from "./types.js";
export interface CandidateRegionDetectorOptions {
    gridSize?: number;
    windowCells?: number;
    maximumRegions?: number;
    minimumScore?: number;
}
/** Lightweight edge/line detector. Callers must retain a full-frame fallback. */
export declare class CandidateRegionDetector {
    private readonly options;
    constructor(options?: CandidateRegionDetectorOptions);
    detect(frame: NormalizedFrame): BarcodeCandidateRegion[];
}
//# sourceMappingURL=candidate-region.d.ts.map