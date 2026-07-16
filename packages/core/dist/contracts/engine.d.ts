import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { NormalizedFrame } from "./frame.js";
import type { CornerPoint } from "./result.js";
export interface EngineCapabilities {
    formats: readonly BarcodeFormat[];
    supportsMultiple: boolean;
    returnsRawBytes: boolean;
    returnsCornerPoints: boolean;
    threadSafe: boolean;
    estimatedScratchBytesPerPixel?: number;
    copiesInputBuffer?: boolean;
}
export type EngineFailureCategory = "not-found" | "unsupported-format" | "invalid-input" | "initialization" | "execution" | "cancelled" | "timeout";
export interface EngineDecodeResult {
    text: string;
    rawBytes?: Uint8Array;
    format: BarcodeFormat;
    cornerPoints?: CornerPoint[];
    orientation?: number;
    symbologyIdentifier?: string;
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