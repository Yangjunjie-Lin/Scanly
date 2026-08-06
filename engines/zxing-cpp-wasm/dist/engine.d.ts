import type { EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
import type { ZxingCppWasmEngine, ZxingCppWasmEngineOptions, ZxingCppWasmMemoryObservation } from "./types.js";
export declare class ZxingCppWasmEngineImpl implements ZxingCppWasmEngine {
    private readonly options;
    readonly id = "zxing-cpp-wasm";
    readonly version = "3.1.1+zxing-cpp.6c2961d";
    readonly capabilities: {
        formats: readonly ["qr_code", "data_matrix", "pdf417", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"];
        formatClasses: readonly ["matrix", "stacked", "linear"];
        supportsMultiple: boolean;
        returnsRawBytes: boolean;
        supportsRawBytes: boolean;
        returnsCornerPoints: boolean;
        threadSafe: boolean;
        estimatedScratchBytesPerPixel: number;
        copiesInputBuffer: boolean;
        runtimeKinds: readonly ["browser", "worker", "node"];
        supportsInversion: boolean;
        supportsStructuredAppend: boolean;
        supportsGs1: boolean;
        supportsOrientation: boolean;
        initializationMode: "lazy";
        executionModel: "wasm";
    };
    private readonly loader;
    private readonly limits;
    private initialLinearMemoryBytes;
    private peakLinearMemoryBytes;
    private inputAllocationBytes;
    private peakInputAllocationBytes;
    private activeNativeResultCount;
    private releasedNativeResultCount;
    constructor(options?: ZxingCppWasmEngineOptions);
    get initializationState(): import("./types.js").ZxingCppWasmInitializationState;
    get selectedVariant(): import("./types.js").ZxingCppWasmVariant | null;
    get initializationMs(): number | null;
    get buildMetadata(): import("./types.js").ZxingCppWasmBuildMetadata;
    initialize(): Promise<void>;
    preload(): Promise<void>;
    prewarm(): Promise<void>;
    decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
    getMemoryObservation(): ZxingCppWasmMemoryObservation;
    dispose(): Promise<void>;
    private get module();
}
//# sourceMappingURL=engine.d.ts.map