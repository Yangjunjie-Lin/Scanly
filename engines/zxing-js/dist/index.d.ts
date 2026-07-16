import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
export declare class ZxingJsEngine implements DecoderEngine {
    readonly id = "zxing-js";
    readonly version = "0.21.3";
    readonly capabilities: {
        formats: "qr_code"[];
        supportsMultiple: boolean;
        returnsRawBytes: boolean;
        returnsCornerPoints: boolean;
        threadSafe: boolean;
    };
    private readonly reader;
    decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
}
//# sourceMappingURL=index.d.ts.map