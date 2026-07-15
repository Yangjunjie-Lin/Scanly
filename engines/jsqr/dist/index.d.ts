import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, NormalizedFrame } from "@scanly/core";
export declare class JsQrEngine implements DecoderEngine {
    readonly id = "jsqr";
    readonly version = "1.4.0";
    readonly capabilities: {
        formats: "qr_code"[];
        supportsMultiple: boolean;
        returnsRawBytes: boolean;
        returnsCornerPoints: boolean;
        threadSafe: boolean;
    };
    decode(frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
}
//# sourceMappingURL=index.d.ts.map