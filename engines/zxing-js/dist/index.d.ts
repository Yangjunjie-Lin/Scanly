import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
export declare class ZxingJsEngine implements DecoderEngine {
    readonly id = "zxing-js";
    readonly version = "0.21.3";
    readonly capabilities: {
        formats: "qr_code"[];
        formatClasses: "matrix"[];
        supportsMultiple: boolean;
        returnsRawBytes: boolean;
        supportsRawBytes: boolean;
        returnsCornerPoints: boolean;
        threadSafe: boolean;
        estimatedScratchBytesPerPixel: number;
        copiesInputBuffer: boolean;
        supportsGs1: boolean;
        supportsOrientation: boolean;
        supportsInversion: boolean;
        runtimeKinds: readonly ["browser", "worker", "node"];
        executionModel: "javascript";
    };
    private readonly reader;
    decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
}
//# sourceMappingURL=index.d.ts.map