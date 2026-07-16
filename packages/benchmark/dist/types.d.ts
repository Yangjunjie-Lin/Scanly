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
    /** Required physical instances, including repeated payloads. */
    requiredInstances?: Array<{
        payload: string;
        count: number;
    }>;
    /** Expected unique decode count (benchmark stop hint). */
    expectedResultCount?: number;
    /** Explicit profile-specific completeness contract; omitted profiles require the full fixture truth. */
    profileExpectedResultCount?: Partial<Record<"fast" | "balanced" | "robust", number>>;
    /** Allow extra payloads beyond required set. */
    allowExtraPayloads?: boolean;
    primaryResultRule?: "top-to-bottom-left-to-right";
    geometryMetadata?: Array<{
        payload: string;
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
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
    heuristicMetrics?: {
        entropyScore: number;
        highFrequencyRatio: number;
        candidateCountBeforeCap: number;
        pathologicalPathActivated: boolean;
        fallbackAttemptsUsed: number;
        finalResult: "success" | "not-found" | "failure";
    };
    controlledMemoryPeakBytes?: number;
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
export interface BenchmarkSourceIdentity {
    commitSha: string;
    treeSha: string;
    repositoryDirty: boolean;
    packageLockHash: string;
    scenarioHash: string;
    datasetHash: string;
    engineCompositionHash: string;
    benchmarkRunnerHash: string;
}
export interface BenchmarkRunSummary {
    schemaVersion: "2.0";
    runtime: {
        kind: "node" | "browser-device";
        nodeVersion?: string;
        platform: string;
        arch: string;
    };
    sourceIdentity: BenchmarkSourceIdentity;
    environment: {
        gitCommit: string;
        sdkVersion: string;
        scenario: "fast" | "balanced" | "robust";
        datasetManifestHash: string;
        fixtureCount: number;
        date: string;
        warmupPolicy: string;
        iterationCount: number;
        coldInitializationMs?: number;
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
    runToRunStdDevMs?: number;
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
    controlledMemoryPeakBytes: number;
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
export interface StrategySummary {
    strategyId: string;
    engineIds: Array<{
        id: string;
        version: string;
    }>;
    scenario?: {
        id: string;
        revision: number;
    };
    fixtureCount: number;
    positiveRecall: number;
    exactPayloadAccuracy: number;
    falsePositiveCount: number;
    multiCodeCompleteness: {
        complete: number;
        total: number;
    };
    averageMs: number;
    medianMs: number;
    p95Ms: number;
    averageAttempts: number;
    p95Attempts: number;
    timeoutCount: number;
    unsupportedCases: number;
    initializationFailures: number;
    executionFailures: number;
    uniqueWins: string[];
    packageSizeBytes: number;
    initializationMs: number;
    averageControlledMemoryPeakBytes: number;
}
export interface StrategyFixtureResult {
    fixtureId: string;
    strategyId: string;
    expectedOutcome: BenchmarkExpectedOutcome;
    payloads: string[];
    pass: boolean;
    exactPayload: boolean;
    falsePositive: boolean;
    multipleComplete: boolean;
    elapsedMs: number;
    attemptCount: number;
    failureReason: string | null;
    controlledMemoryPeakBytes?: number;
    engineDiagnostics?: Array<{
        engineId: string;
        status: string;
        elapsedMs: number;
        attemptCount: number;
        resultCount: number;
    }>;
}
export interface ComparisonReport {
    schemaVersion: "2.0";
    generatedAt: string;
    sdkVersion: string;
    sourceIdentity: BenchmarkSourceIdentity;
    fixtureCount: number;
    positiveCases: number;
    negativeCases: number;
    methodology: string;
    strategies: StrategySummary[];
    perFixture: StrategyFixtureResult[];
}
export interface BrowserBenchmarkMetadata {
    browserName: string;
    browserVersion: string;
    operatingSystem: string;
    architecture: string;
    workerAvailable: boolean;
    offscreenCanvasAvailable: boolean;
    imageBitmapAvailable: boolean;
}
export interface DeviceBenchmarkMetadata {
    deviceModel: string;
    operatingSystem: string;
    browserOrRuntime: string;
    cameraResolution?: string;
    thermalState?: string;
    powerMode?: string;
}
export interface BrowserBenchmarkReport {
    schemaVersion: "1.0";
    generatedAt: string;
    metadata: BrowserBenchmarkMetadata;
    fixtureCount: number;
    positiveRecall: number;
    falsePositiveCount: number;
    averageMs: number;
    p95Ms: number;
    memoryObservation: string;
    results: Array<{
        fixtureId: string;
        pass: boolean;
        elapsedMs: number;
        payloads: string[];
    }>;
}
//# sourceMappingURL=types.d.ts.map