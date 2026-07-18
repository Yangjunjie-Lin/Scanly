import type { StructuredPayload } from "@scanly/parsers";
import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { SdkError } from "./errors.js";
import type { MemoryObservation } from "../runtime/memory-budget.js";

export interface CornerPoint { x: number; y: number }
export interface ValidationResult { valid: boolean; validatorIds: string[]; messages: string[] }
export interface HeuristicQualitySignal {
  value: number;
  definition: string;
}
export interface HeuristicDebugMetrics {
  entropyScore: number;
  highFrequencyRatio: number;
  candidateCountBeforeCap: number;
  pathologicalPathActivated: boolean;
  fallbackAttemptsUsed: number;
  finalResult: "success" | "not-found" | "failure";
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
  controlledMemory?: MemoryObservation;
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
    variant?: string;
    executionModel?: "javascript" | "wasm" | "native";
    initializationMs?: number;
    wasmLinearMemoryBytes?: number;
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
export interface DebugTraceEvent { atMs: number; stage: string; detail?: string }
export interface ScanAttempt {
  index: number;
  engineId: string;
  candidateIndex: number;
  preprocessing: string;
  rotation: number;
  elapsedMs: number;
  success: boolean;
}
export type EngineDiagnosticStatus = "success" | "not-found" | "unsupported" | "cancelled" | "timeout" | "initialization-failure" | "execution-failure";
export interface EngineDiagnostic {
  engineId: string;
  engineVersion: string;
  status: EngineDiagnosticStatus;
  elapsedMs: number;
  attemptCount: number;
  resultCount: number;
  errorCode?: string;
  variant?: string;
  message?: string;
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
  engineDiagnostics?: EngineDiagnostic[];
  heuristics?: HeuristicDebugMetrics;
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
  engineDiagnostics?: EngineDiagnostic[];
  heuristics?: HeuristicDebugMetrics;
}
export type ScanOutcome = ScanSuccess | ScanFailure;
