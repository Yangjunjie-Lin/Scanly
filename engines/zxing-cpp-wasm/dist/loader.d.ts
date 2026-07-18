import { type ZXingReaderModule } from "zxing-wasm/reader";
import type { ZxingCppWasmBuildMetadata, ZxingCppWasmEngineOptions, ZxingCppWasmErrorCode, ZxingCppWasmInitializationState, ZxingCppWasmVariant } from "./types.js";
export declare class ZxingCppWasmError extends Error {
    readonly code: ZxingCppWasmErrorCode;
    readonly retryable: boolean;
    readonly cause?: unknown;
    constructor(code: ZxingCppWasmErrorCode, message: string, options?: {
        retryable?: boolean;
        cause?: unknown;
    });
}
export declare class ZxingCppWasmLoader {
    private readonly options;
    private state;
    private initializationPromise?;
    private module?;
    private variant;
    private attempts;
    private acquired;
    private initializedAtMs;
    constructor(options?: ZxingCppWasmEngineOptions);
    get initializationState(): ZxingCppWasmInitializationState;
    get selectedVariant(): ZxingCppWasmVariant | null;
    get initializationMs(): number | null;
    get buildMetadata(): ZxingCppWasmBuildMetadata;
    get readerModule(): ZXingReaderModule;
    initialize(): Promise<void>;
    private initializeOnce;
    dispose(): Promise<void>;
}
//# sourceMappingURL=loader.d.ts.map