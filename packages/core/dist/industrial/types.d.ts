import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { NormalizedFrame } from "../contracts/frame.js";
import type { CornerPoint, ScanResult } from "../contracts/result.js";
import type { RecoveryMemoryAccountant } from "./memory.js";
export type DifficultyLevel = "none" | "low" | "medium" | "high";
export type RecoveryRouteId = "general" | "low-contrast" | "illumination" | "blur" | "glare" | "perspective" | "curved" | "small-module" | "damaged" | "quiet-zone" | "screen" | "dpm";
export type RecoveryProfile = "fast" | "balanced" | "robust" | "industrial" | "dpm-experimental";
export type RecoverySourceMode = "camera" | "static";
export interface RecoveryBudget {
    maximumRoutes: number;
    maximumAttempts: number;
    maximumPixelsProcessed: number;
    maximumTotalMs?: number;
    maximumCandidates?: number;
    maximumRectifiedArea?: number;
    maximumPerspectiveTransforms?: number;
    maximumTemporaryBytes?: number;
}
export interface BarcodeDifficultyDiagnosis {
    blur: DifficultyLevel;
    motionBlur: DifficultyLevel;
    underexposure: DifficultyLevel;
    overexposure: DifficultyLevel;
    glare: DifficultyLevel;
    lowContrast: DifficultyLevel;
    perspectiveDistortion: DifficultyLevel;
    curvature: DifficultyLevel;
    smallModule: DifficultyLevel;
    printingDamage: DifficultyLevel;
    occlusion: DifficultyLevel;
    screenMoiré?: DifficultyLevel;
    dpmLikelihood?: number;
    recommendedRoutes: RecoveryRouteId[];
    /** Heuristic observations used for routing; never a Ground Truth label. */
    evidence: Readonly<Record<string, number>>;
}
export interface BarcodeCandidateRegion {
    id: string;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    score: number;
    orientationEstimate?: number;
    difficultyHints: string[];
}
/** Maps coordinates between a recovery candidate and the original frame. */
export interface RecoveryCoordinateTransform {
    readonly kind: "identity" | "crop" | "resize" | "perspective" | "curved" | "padding" | "composed";
    forward(point: CornerPoint): CornerPoint;
    inverse(point: CornerPoint): CornerPoint;
}
export interface RecoveryCandidate {
    id: string;
    routeId: RecoveryRouteId;
    frame: NormalizedFrame;
    transform: RecoveryCoordinateTransform;
    pixelsProcessed: number;
    diagnostics: readonly string[];
    dispose(): void;
}
export interface RecoveryContext {
    diagnosis: BarcodeDifficultyDiagnosis;
    profile: RecoveryProfile;
    sourceMode: RecoverySourceMode;
    budget: RecoveryBudget;
    framePixels: number;
    memory: RecoveryMemoryAccountant;
    candidateRegions: readonly BarcodeCandidateRegion[];
    acceptedFormats?: readonly BarcodeFormat[];
    signal?: AbortSignal;
    startedAt: number;
    now: () => number;
    dpmExperimentalEnabled: boolean;
    excludedRoutes?: readonly RecoveryRouteId[];
}
export interface RecoveryRoute {
    readonly id: RecoveryRouteId;
    supports(context: RecoveryContext): boolean;
    /** Deterministic relative cost used only to order and cap route selection. */
    estimateCost(context: RecoveryContext): number;
    run(frame: NormalizedFrame, context: RecoveryContext): Promise<RecoveryCandidate[]>;
}
export interface RecoveryPlanEntry {
    routeId: RecoveryRouteId;
    estimatedCost: number;
    reason: string;
}
export interface RecoveryPlan {
    entries: readonly RecoveryPlanEntry[];
    budget: RecoveryBudget;
    rejected: readonly {
        routeId: RecoveryRouteId;
        reason: string;
    }[];
}
export interface DecodeCandidate {
    payload: string;
    format: BarcodeFormat;
    engine: string;
    route: RecoveryRouteId;
    geometry?: readonly CornerPoint[];
    validation: {
        decoderValidation: boolean;
        checksumValidated?: boolean;
        formatStructuralValidity?: boolean;
        errorCorrectionEvidence?: number;
    };
    result: ScanResult;
    elapsedMs: number;
}
export interface DecodeCandidateConflict {
    key: string;
    candidates: readonly DecodeCandidate[];
    reason: string;
}
export interface DecodeCandidateSet {
    candidates: readonly DecodeCandidate[];
    confirmed?: DecodeCandidate;
    confirmedCandidates: readonly DecodeCandidate[];
    conflicts: readonly DecodeCandidateConflict[];
    rejectedCount: number;
}
export interface ScanEvidence {
    decoderValidation: boolean;
    checksumValidated?: boolean;
    errorCorrectionEvidence?: number;
    temporalObservations: number;
    independentRouteAgreement: number;
    geometryQuality: number;
    recoveryRoutesUsed: RecoveryRouteId[];
    /** Bounded evidence aggregate. It is not a calibrated probability. */
    evidenceScore: number;
}
export interface RecoveryRouteAttribution {
    route: RecoveryRouteId;
    attempts: number;
    candidates: number;
    pixelsProcessed: number;
    elapsedMs: number;
    success: boolean;
    additionalTruePositives?: number;
    additionalFalsePositives?: number;
}
export type RecoveryDecodeExecutor = (frame: NormalizedFrame, request: {
    routeId: RecoveryRouteId;
    signal?: AbortSignal;
    remainingRecoveryAttempts: number;
}) => Promise<import("../contracts/result.js").ScanOutcome>;
export interface IndustrialRecoveryOptions {
    profile?: RecoveryProfile;
    sourceMode?: RecoverySourceMode;
    budget?: RecoveryBudget;
    signal?: AbortSignal;
    dpmExperimental?: boolean;
    excludedRoutes?: readonly RecoveryRouteId[];
    temporalObservations?: number;
    normalOutcome?: import("../contracts/result.js").ScanOutcome;
}
export interface IndustrialRecoveryResult {
    outcome: import("../contracts/result.js").ScanOutcome;
    diagnostics: RecoveryDiagnostics;
    memory: import("./memory.js").RecoveryMemoryObservation;
}
export interface RecoveryDiagnostics {
    diagnosis: BarcodeDifficultyDiagnosis;
    plan: RecoveryPlan;
    routes: readonly RecoveryRouteAttribution[];
    attemptedRoutes: RecoveryRouteId[];
    successfulRoute?: RecoveryRouteId;
    attemptCount: number;
    processedPixels: number;
    elapsedMs: number;
    candidateSet: DecodeCandidateSet;
    evidence?: ScanEvidence;
    insufficientEvidence: boolean;
    reasons: readonly string[];
}
export interface RecoveryQualityEvidence {
    blurScore?: number;
    brightness?: number;
    contrast?: number;
    glareRatio?: number;
    edgeDensity?: number;
    motionEstimate?: number;
}
//# sourceMappingURL=types.d.ts.map