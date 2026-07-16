export type BenchmarkCategory = "clear" | "text" | "url" | "wifi" | "low_contrast" | "underexposed" | "overexposed" | "blur" | "motion_blur" | "noise" | "glare" | "inverted" | "rotation" | "perspective" | "small_in_large" | "near_edge" | "complex_background" | "multiple" | "occlusion" | "damaged" | "high_resolution" | "screen_capture" | "unusual_aspect" | "colored_background" | "phone_photo" | "negative" | "adversarial";
export type BenchmarkExpectedOutcome = "decode" | "no-symbol" | "invalid-input";
export type BenchmarkFailureCode = "no_symbol_found" | "invalid_image" | "timeout" | "cancelled" | "engine_execution_failure" | "engine_initialization_failure" | "worker_initialization_failure" | "resource_limit_exceeded" | "internal_invariant_failure" | "concurrent_call_rejected" | "session_disposed";
export type BenchmarkSourceType = "generated" | "project-photo";
export interface BenchmarkFixture {
    id: string;
    file: string;
    category: BenchmarkCategory;
    expectedPayload: string | string[];
    expectedOutcome: BenchmarkExpectedOutcome;
    allowedFailureCodes?: BenchmarkFailureCode[];
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
    timeToFirstResultMs?: number;
    phaseTiming?: {
        frameNormalizationMs?: number;
        roiMs?: number;
        localizationMs?: number;
        candidateGenerationMs: number;
        candidateDeduplicationMs?: number;
        preprocessMs: number;
        rotationMs: number;
        engineMs: Record<string, number>;
        validationMs?: number;
        semanticParsingMs?: number;
    };
}
export interface BenchmarkDistribution {
    average: number;
    median: number;
    p95: number;
}
export interface BenchmarkRunSummary {
    schemaVersion: "2.0";
    runtime: {
        kind: "node" | "browser-device";
        nodeVersion?: string;
        platform: string;
        arch: string;
    };
    environment: {
        gitCommit: string;
        sdkVersion: string;
        scenario: "fast" | "balanced" | "robust";
        datasetManifestHash: string;
        fixtureCount: number;
        date: string;
        warmupPolicy: string;
        iterationCount: number;
    };
    generatedAt: string;
    total: number;
    passed: number;
    failed: number;
    successRate: number;
    averageMs: number;
    medianMs: number;
    p95Ms: number;
    p99Ms: number | null;
    positiveCases: number;
    decodeRecall: number;
    exactPayloadAccuracy: number;
    negativeCases: number;
    falsePositiveCount: number;
    falsePositiveRate: number;
    timeoutCount: number;
    cancellationCorrectness: {
        passed: number;
        total: number;
    };
    engineInitializationFailures: number;
    engineExecutionFailures: number;
    phaseTimingAvailability: {
        passed: number;
        total: number;
    };
    timeToFirstResult: BenchmarkDistribution;
    averageAttempts: number;
    medianAttempts: number;
    p95Attempts: number;
    decoderDistribution: Record<string, number>;
    preprocessingDistribution: Record<string, number>;
    candidateDistribution: Record<string, number>;
    perFormatRecall: Record<string, {
        total: number;
        decoded: number;
        recall: number;
    }>;
    memoryObservations: string[];
    phaseTiming: Record<string, BenchmarkDistribution>;
    perCategory: Record<string, {
        total: number;
        passed: number;
        successRate: number;
        averageMs: number;
    }>;
    multipleCompleteness: {
        total: number;
        complete: number;
        incomplete: string[];
    };
    worstFixtures: Array<{
        id: string;
        elapsedMs: number;
        attemptCount: number;
        pass: boolean;
    }>;
    regressionCount: number;
    remainingFailures: string[];
    results: BenchmarkFixtureResult[];
}
//# sourceMappingURL=types.d.ts.map