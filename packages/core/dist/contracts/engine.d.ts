import type { BarcodeFormat, BarcodeFormatClass } from "@scanly/scenario-schema";
import type { NormalizedFrame } from "./frame.js";
import type { CornerPoint } from "./result.js";
export interface EngineCapabilities {
    formats: readonly BarcodeFormat[];
    formatClasses?: readonly BarcodeFormatClass[];
    supportsMultiple: boolean;
    returnsRawBytes: boolean;
    /** Alpha.5 spelling retained alongside the Alpha.4 returnsRawBytes field. */
    supportsRawBytes?: boolean;
    returnsCornerPoints: boolean;
    threadSafe: boolean;
    estimatedScratchBytesPerPixel?: number;
    copiesInputBuffer?: boolean;
    runtimeKinds?: readonly ("browser" | "worker" | "node")[];
    supportsInversion?: boolean;
    supportsStructuredAppend?: boolean;
    supportsGs1?: boolean;
    supportsOrientation?: boolean;
    initializationMode?: "lazy" | "explicit";
    executionModel?: "javascript" | "wasm" | "native";
}
export type EngineFailureCategory = "not-found" | "unsupported-format" | "invalid-input" | "initialization" | "execution" | "cancelled" | "timeout";
export type EngineFailureCode = "asset_not_found" | "asset_integrity_failed" | "wasm_compile_failed" | "wasm_instantiate_failed" | "unsupported_runtime" | "unsupported_simd" | "initialization_timeout" | "native_decode_failed" | "invalid_native_result" | "out_of_memory" | "cancelled" | "disposed";
export interface EngineExecutionMetadata {
    variant?: string;
    executionModel?: "javascript" | "wasm" | "native";
    initializationMs?: number;
    wasmLinearMemoryBytes?: number;
    requestedFormats?: readonly BarcodeFormat[];
    nativeFormat?: string;
    detectedFormat?: BarcodeFormat;
}
export interface EngineDecodeResult {
    text: string;
    rawBytes?: Uint8Array;
    format: BarcodeFormat;
    cornerPoints?: CornerPoint[];
    orientation?: number;
    symbologyIdentifier?: string;
    isGs1?: boolean;
    metadata?: Record<string, unknown>;
    engineMetadata?: EngineExecutionMetadata;
    elapsedMs: number;
}
export type EngineOutcome = {
    ok: true;
    results: [EngineDecodeResult, ...EngineDecodeResult[]];
} | {
    ok: false;
    category: EngineFailureCategory;
    message: string;
    elapsedMs: number;
    code?: EngineFailureCode;
};
export interface EngineDecodeOptions {
    formats: readonly BarcodeFormat[];
    findMultiple: boolean;
    signal?: AbortSignal;
    /** Whether upstream preprocessing already inverted the candidate. */
    inversion?: "unknown" | "original" | "inverted";
}
export interface DecoderEngine {
    readonly id: string;
    readonly version: string;
    readonly capabilities: EngineCapabilities;
    initialize?(): Promise<void>;
    decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
    dispose?(): void | Promise<void>;
}
export interface EngineRegistrationOptions {
    /** Duplicate ids are rejected unless replacement is explicit. */
    replace?: boolean;
}
export interface EngineRegistryContract {
    register(engine: DecoderEngine, options?: EngineRegistrationOptions): void;
    unregister(id: string): void;
    get(id: string): DecoderEngine | undefined;
    list(): readonly DecoderEngine[];
    resolve(formats: readonly BarcodeFormat[]): readonly DecoderEngine[];
    initializeAll(): Promise<void>;
    disposeAll(): Promise<void>;
}
//# sourceMappingURL=engine.d.ts.map