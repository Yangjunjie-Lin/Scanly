export declare const SCENARIO_SCHEMA_VERSION: "2.0";
export type BarcodeFormat = "qr_code" | "micro_qr" | "rmqr" | "data_matrix" | "gs1_data_matrix" | "pdf417" | "micro_pdf417" | "aztec" | "code_128" | "gs1_128" | "code_39" | "code_93" | "ean_8" | "ean_13" | "upc_a" | "upc_e" | "itf" | "itf_14" | "codabar" | "gs1_databar";
export type PixelFormatPreference = "rgba8888" | "rgb888" | "gray8" | "yuv420";
export type DecoderId = "jsqr" | "zxing-js" | "zxing-cpp-wasm" | "native-qr";
export type EnhancementId = "contrast" | "gamma" | "invert" | "otsu" | "threshold-115" | "threshold-140" | "threshold-165" | "sharpen";
export type SemanticParserId = "url" | "wifi" | "vcard" | "email" | "telephone" | "sms" | "geo" | "calendar" | "gs1" | "gs1-digital-link";
export interface ScenarioDefinition {
    schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
    id: string;
    revision: number;
    description?: string;
    acceptedFormats: BarcodeFormat[];
    input: {
        preferredPixelFormats: PixelFormatPreference[];
        roi: {
            mode: "full-frame" | "relative";
            x?: number;
            y?: number;
            width?: number;
            height?: number;
        };
    };
    localization: {
        strategy: "edge-density" | "full-frame";
        maxCandidates: number;
        cropPaddings: Array<"tight" | "medium" | "expanded">;
        scales: number[];
    };
    enhancement: {
        operators: EnhancementId[];
        rotations: Array<0 | 90 | 180 | 270>;
    };
    decoders: {
        order: DecoderId[];
        execution: "sequential" | "parallel";
    };
    multiCode: {
        enabled: boolean;
        maxResults: number;
    };
    duplicateSuppression: {
        enabled: boolean;
        windowMs: number;
    };
    budgets: {
        maxPixels: number;
        maxCandidates: number;
        maxAttempts: number;
        maxIntermediateAllocations: number;
        maxIntermediateBytes: number;
        maxExecutionMs: number;
        maxConcurrentFrames: number;
    };
    validation: Array<{
        id: string;
        required: boolean;
    }>;
    semanticParsers: SemanticParserId[];
    quality: {
        minimumHeuristicQuality?: number;
    };
    output: {
        includeRawBytes: boolean;
        includeDebugTrace: boolean;
        includeAttempts: boolean;
    };
    ablation: {
        localization: boolean;
        multiScale: boolean;
        enhancement: boolean;
        rotations: boolean;
        zxingFallback: boolean;
        splitImageFallback: boolean;
    };
}
export interface ScenarioValidationIssue {
    code: "required" | "type" | "range" | "enum" | "unsupported-version" | "duplicate";
    path: string;
    message: string;
}
export type ScenarioValidationResult = {
    ok: true;
    value: ScenarioDefinition;
} | {
    ok: false;
    issues: ScenarioValidationIssue[];
    message: string;
};
export declare function validateScenario(input: unknown): ScenarioValidationResult;
export declare const BUILTIN_SCENARIOS: Readonly<Record<"fast" | "balanced" | "robust", ScenarioDefinition>>;
export type BuiltinScenarioId = keyof typeof BUILTIN_SCENARIOS;
export declare function getBuiltinScenario(id: BuiltinScenarioId): ScenarioDefinition;
export declare function migrateScenario(input: unknown): ScenarioValidationResult;
//# sourceMappingURL=index.d.ts.map