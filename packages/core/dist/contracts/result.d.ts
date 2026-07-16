import type { StructuredPayload } from "@scanly/parsers";
import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { SdkError } from "./errors.js";
export interface CornerPoint {
    x: number;
    y: number;
}
export interface ValidationResult {
    valid: boolean;
    validatorIds: string[];
    messages: string[];
}
export interface HeuristicQualitySignal {
    value: number;
    definition: string;
}
export interface ScanTiming {
    totalMs: number;
    timeToFirstResultMs?: number;
    frameNormalizationMs?: number;
    roiMs?: number;
    localizationMs?: number;
    candidateGenerationMs?: number;
    candidateDeduplicationMs?: number;
    preprocessingMs?: number;
    rotationMs?: number;
    decodingMs?: number;
    engineMs?: Record<string, number>;
    validationMs?: number;
    semanticParsingMs?: number;
    workerSetupMs?: number;
    workerTransferMs?: number;
}
export interface CandidateMetadata {
    index: number;
    score?: number;
    padding?: string;
    scale?: string;
    rotation?: number;
}
export interface ScanResult {
    format: BarcodeFormat;
    rawText: string;
    rawBytes?: Uint8Array;
    /** Pixel coordinates in the original normalized frame coordinate space. */
    cornerPoints?: CornerPoint[];
    /** Clockwise symbol orientation relative to the original normalized frame, when engine-derived. */
    orientation?: number;
    heuristicQuality?: HeuristicQualitySignal;
    engine: {
        id: string;
        version: string;
    };
    preprocessingPath: string[];
    candidate?: CandidateMetadata;
    frameId: string;
    trackId?: string;
    structuredPayload: StructuredPayload | null;
    symbologyIdentifier?: string;
    validation: ValidationResult;
    warnings: string[];
    timing: ScanTiming;
}
export type NonEmptyArray<T> = [T, ...T[]];
export interface DebugTraceEvent {
    atMs: number;
    stage: string;
    detail?: string;
}
export interface ScanAttempt {
    index: number;
    engineId: string;
    candidateIndex: number;
    preprocessing: string;
    rotation: number;
    elapsedMs: number;
    success: boolean;
}
export interface ScanSuccess {
    ok: true;
    results: NonEmptyArray<ScanResult>;
    primary: ScanResult;
    frameId: string;
    scenarioId: string;
    attemptCount: number;
    timing: ScanTiming;
    trace?: DebugTraceEvent[];
    attempts?: ScanAttempt[];
}
export interface ScanFailure {
    ok: false;
    error: SdkError;
    frameId: string;
    scenarioId: string;
    attemptCount: number;
    timing: ScanTiming;
    trace?: DebugTraceEvent[];
    attempts?: ScanAttempt[];
}
export type ScanOutcome = ScanSuccess | ScanFailure;
//# sourceMappingURL=result.d.ts.map