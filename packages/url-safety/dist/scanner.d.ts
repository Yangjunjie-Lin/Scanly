import { type StructuredPayload } from "@scanly/parsers";
import type { UrlSafetyAnalysis, UrlSafetyAnalyzer, UrlSafetyPrivacyMode, UrlSafetyStatus } from "./types.js";
export interface UrlSafetyState {
    status: UrlSafetyStatus;
    analysis?: UrlSafetyAnalysis;
}
export interface UrlSafetyScanEvent {
    type: string;
    barcode: {
        text: string;
    };
}
export interface UrlSafetyScannerSession {
    onResult(listener: (event: UrlSafetyScanEvent) => void): () => void;
    onStateChange(listener: (state: string) => void): () => void;
}
/** Optional observer, never a decoder/Worker dependency. Disabled until configured. */
export declare class UrlSafetyController {
    private readonly analyzer;
    private readonly onState;
    private generation;
    private controller?;
    private currentUrl?;
    private mode?;
    private disposed;
    private detach?;
    constructor(analyzer: UrlSafetyAnalyzer, onState: (state: UrlSafetyState) => void);
    configure(mode?: UrlSafetyPrivacyMode): void;
    private emit;
    accept(payload: StructuredPayload | null | undefined): void;
    acceptEvent(event: UrlSafetyScanEvent): void;
    attach(session: UrlSafetyScannerSession): () => void;
    cancel(): void;
    dispose(): void;
}
//# sourceMappingURL=scanner.d.ts.map