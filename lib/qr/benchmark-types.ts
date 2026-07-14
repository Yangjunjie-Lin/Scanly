export type BenchmarkCategory =
  | "clear"
  | "text"
  | "url"
  | "wifi"
  | "low_contrast"
  | "underexposed"
  | "overexposed"
  | "blur"
  | "motion_blur"
  | "noise"
  | "glare"
  | "inverted"
  | "rotation"
  | "perspective"
  | "small_in_large"
  | "near_edge"
  | "complex_background"
  | "multiple"
  | "occlusion"
  | "damaged"
  | "high_resolution"
  | "screen_capture"
  | "unusual_aspect"
  | "colored_background"
  | "phone_photo";

export type BenchmarkExpectedOutcome = "decode" | "fail";

export type BenchmarkSourceType = "generated" | "project-photo";

export interface BenchmarkFixture {
  id: string;
  file: string;
  category: BenchmarkCategory;
  expectedPayload: string | string[];
  expectedOutcome: BenchmarkExpectedOutcome;
  sourceType: BenchmarkSourceType;
  license: string;
  /** Fixed generator seed for reproducible generated fixtures. */
  generatedSeed?: number;
  /** Generator/provenance note describing where transforms are defined. */
  transformMetadata?: string;
  /** Optional: primary payload when multiple codes (stable contract). */
  primaryPayload?: string;
  /** All payloads that must appear for a full pass (multiple fixtures). */
  requiredPayloads?: string[];
  /** Expected unique decode count (benchmark stop hint). */
  expectedResultCount?: number;
  /** Allow extra payloads beyond required set. */
  allowExtraPayloads?: boolean;
  notes?: string;
}

export interface BenchmarkFixtureResult {
  id: string;
  category: BenchmarkCategory;
  expectedPayload: string | string[];
  actualPayload: string | null;
  allPayloads: string[];
  pass: boolean;
  elapsedMs: number;
  successfulDecoder: string | null;
  preprocessingPath: string | null;
  candidateIndex: number | null;
  attemptCount: number;
  failureReason: string | null;
  expectedOutcome: BenchmarkExpectedOutcome;
  missingPayloads?: string[];
  unexpectedPayloads?: string[];
  requiredPayloadCount?: number;
  decodedPayloadCount?: number;
  phaseTiming?: {
    candidateGenerationMs: number;
    jsqrMs: number;
    zxingMs: number;
    preprocessMs: number;
    rotationMs: number;
  };
}

export interface BenchmarkDistribution {
  average: number;
  median: number;
  p95: number;
}

export interface BenchmarkRunSummary {
  generatedAt: string;
  total: number;
  passed: number;
  failed: number;
  successRate: number;
  averageMs: number;
  medianMs: number;
  p95Ms: number;
  averageAttempts: number;
  medianAttempts: number;
  p95Attempts: number;
  decoderDistribution: Record<string, number>;
  preprocessingDistribution: Record<string, number>;
  phaseTiming: {
    candidateGenerationMs: BenchmarkDistribution;
    jsqrMs: BenchmarkDistribution;
    zxingMs: BenchmarkDistribution;
    preprocessMs: BenchmarkDistribution;
    rotationMs: BenchmarkDistribution;
  };
  perCategory: Record<
    string,
    { total: number; passed: number; successRate: number; averageMs: number }
  >;
  multipleCompleteness: {
    total: number;
    complete: number;
    incomplete: string[];
  };
  worstFixtures: Array<{ id: string; elapsedMs: number; attemptCount: number; pass: boolean }>;
  regressionCount: number;
  remainingFailures: string[];
  results: BenchmarkFixtureResult[];
}
