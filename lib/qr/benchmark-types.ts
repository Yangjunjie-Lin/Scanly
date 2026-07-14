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
  /** Optional: primary payload when multiple codes (stable contract). */
  primaryPayload?: string;
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
  decoderDistribution: Record<string, number>;
  preprocessingDistribution: Record<string, number>;
  perCategory: Record<
    string,
    { total: number; passed: number; successRate: number; averageMs: number }
  >;
  regressionCount: number;
  remainingFailures: string[];
  results: BenchmarkFixtureResult[];
}
