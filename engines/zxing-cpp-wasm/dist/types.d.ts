import type { DecoderEngine } from "@scanly/core";
export type ZxingCppWasmVariant = "standard" | "simd";
export type ZxingCppWasmVariantPreference = ZxingCppWasmVariant | "auto";
export type ZxingCppWasmInitializationState = "uninitialized" | "loading" | "ready" | "failed" | "disposed";
export type ZxingCppWasmRuntimeKind = "browser" | "worker" | "node";
export type ZxingCppWasmInitializationMode = "cold" | "preload" | "prewarm" | "persistent";
export type ZxingCppWasmErrorCode = "asset_not_found" | "asset_integrity_failed" | "wasm_compile_failed" | "wasm_instantiate_failed" | "unsupported_runtime" | "unsupported_simd" | "initialization_timeout" | "native_decode_failed" | "invalid_native_result" | "out_of_memory" | "cancelled" | "disposed";
export interface ZxingCppWasmBuildMetadata {
    schemaVersion: "1.0";
    distribution: {
        name: "zxing-wasm";
        version: string;
        sourceCommit: string;
        integrity: string;
    };
    upstream: {
        name: "zxing-cpp";
        commit: string;
        license: "Apache-2.0";
    };
    toolchain: {
        emscripten: string;
        cmakeMinimum: string;
        canonicalEnvironment: string;
    };
    build: {
        timestampPolicy: string;
        readerOnly: true;
        flags: string[];
        sourceHash: string;
        glueSha256: string;
    };
    assets: Record<ZxingCppWasmVariant, {
        file: string;
        available: boolean;
        sha256: string | null;
        bytes: number;
        simd: boolean;
    }>;
    licenseFiles: string[];
}
export interface ZxingCppWasmMemoryObservation {
    initialLinearMemoryBytes: number;
    currentLinearMemoryBytes: number;
    peakLinearMemoryBytes: number;
    inputAllocationBytes: number;
    peakInputAllocationBytes: number;
    activeNativeResultCount: number;
    releasedNativeResultCount: number;
}
export type ZxingCppWasmAsset = Uint8Array | ArrayBuffer | URL | string;
export type ZxingCppWasmAssetResolver = (variant: ZxingCppWasmVariant, metadata: ZxingCppWasmBuildMetadata) => ZxingCppWasmAsset | Promise<ZxingCppWasmAsset>;
export interface ZxingCppWasmEngineOptions {
    variant?: ZxingCppWasmVariantPreference;
    initializationMode?: ZxingCppWasmInitializationMode;
    assetResolver?: ZxingCppWasmAssetResolver;
    verifyAssetIntegrity?: boolean;
    initializationTimeoutMs?: number;
    maxInitializationAttempts?: number;
    maximumPixels?: number;
    maximumInputBytes?: number;
    maximumResultCount?: number;
    maximumResultBytes?: number;
    tryHarder?: boolean;
}
export interface ZxingCppWasmEngine extends DecoderEngine {
    readonly initializationState: ZxingCppWasmInitializationState;
    readonly selectedVariant: ZxingCppWasmVariant | null;
    readonly initializationMs: number | null;
    readonly buildMetadata: ZxingCppWasmBuildMetadata;
    initialize(): Promise<void>;
    preload(): Promise<void>;
    prewarm(): Promise<void>;
    getMemoryObservation(): ZxingCppWasmMemoryObservation;
    dispose(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map