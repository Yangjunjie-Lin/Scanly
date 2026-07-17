import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { DecoderEngine, EngineDecodeOptions, EngineOutcome, EngineRegistrationOptions, EngineRegistryContract } from "../contracts/engine.js";
import type { NormalizedFrame } from "../contracts/frame.js";
export declare class EngineRegistry implements EngineRegistryContract {
    private readonly records;
    private disposed;
    register(engine: DecoderEngine, options?: EngineRegistrationOptions): void;
    unregister(id: string): void;
    get(id: string): DecoderEngine | undefined;
    list(): readonly DecoderEngine[];
    resolve(formats: readonly BarcodeFormat[]): readonly DecoderEngine[];
    initializeAll(): Promise<void>;
    decode(id: string, frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome>;
    disposeAll(): Promise<void>;
    get isDisposed(): boolean;
    private initialize;
    private assertUsable;
}
//# sourceMappingURL=engine-registry.d.ts.map