import type { NormalizedFrame } from "../contracts/frame.js";
import { CandidateRegionDetector } from "./candidate-region.js";
import { DecodeCandidateResolver } from "./decode-candidate-conflict.js";
import { BarcodeDifficultyAnalyzer } from "./difficulty-diagnosis.js";
import { RecoveryRouteRegistry } from "./recovery-route-registry.js";
import type { IndustrialRecoveryOptions, IndustrialRecoveryResult, RecoveryDecodeExecutor } from "./types.js";
export interface IndustrialRecoveryPipelineDependencies {
    routes?: RecoveryRouteRegistry;
    analyzer?: BarcodeDifficultyAnalyzer;
    detector?: CandidateRegionDetector;
    resolver?: DecodeCandidateResolver;
    now?: () => number;
}
export declare class IndustrialRecoveryPipeline {
    private readonly routes;
    private readonly analyzer;
    private readonly detector;
    private readonly resolver;
    private readonly now;
    constructor(dependencies?: IndustrialRecoveryPipelineDependencies);
    run(frame: NormalizedFrame, decode: RecoveryDecodeExecutor, options?: IndustrialRecoveryOptions): Promise<IndustrialRecoveryResult>;
}
//# sourceMappingURL=recovery-pipeline.d.ts.map