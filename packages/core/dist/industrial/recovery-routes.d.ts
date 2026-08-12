import type { NormalizedFrame } from "../contracts/frame.js";
import { RecoveryRouteRegistry } from "./recovery-route-registry.js";
import type { RecoveryContext, RecoveryCandidate, RecoveryRoute } from "./types.js";
export declare class LowContrastRecoveryRoute implements RecoveryRoute {
    readonly id: "low-contrast";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class IlluminationRecoveryRoute implements RecoveryRoute {
    readonly id: "illumination";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class BlurRecoveryRoute implements RecoveryRoute {
    readonly id: "blur";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class GlareRecoveryRoute implements RecoveryRoute {
    readonly id: "glare";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class PerspectiveRecoveryRoute implements RecoveryRoute {
    readonly id: "perspective";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export interface CurvatureEstimate {
    strength: number;
    confidence: number;
    direction: "horizontal" | "vertical";
}
export interface CurvedBarcodeCandidate extends RecoveryCandidate {
    curvature: CurvatureEstimate;
}
export declare class CurvatureEstimator {
    estimate(context: RecoveryContext): CurvatureEstimate;
}
export declare class CurvedRecoveryRoute implements RecoveryRoute {
    readonly id: "curved";
    private readonly estimator;
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class SmallModuleRecoveryRoute implements RecoveryRoute {
    readonly id: "small-module";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class DamagedRecoveryRoute implements RecoveryRoute {
    readonly id: "damaged";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class QuietZoneRecoveryRoute implements RecoveryRoute {
    readonly id: "quiet-zone";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class ScreenRecoveryRoute implements RecoveryRoute {
    readonly id: "screen";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class DpmExperimentalRecoveryRoute implements RecoveryRoute {
    readonly id: "dpm";
    supports(context: RecoveryContext): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export declare class GeneralRecoveryRoute implements RecoveryRoute {
    readonly id: "general";
    supports(): boolean;
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame): Promise<RecoveryCandidate[]>;
}
export declare function registerDefaultRecoveryRoutes(registry?: RecoveryRouteRegistry): RecoveryRouteRegistry;
//# sourceMappingURL=recovery-routes.d.ts.map