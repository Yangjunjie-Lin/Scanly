import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
export declare class JsQrEngine implements DecoderEngine {
    readonly id = "jsqr";
    readonly version = "1.4.0";
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
    decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
}
//# sourceMappingURL=index.d.ts.map