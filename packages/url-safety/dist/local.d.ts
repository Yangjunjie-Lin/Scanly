import type { StructuredPayload } from "@scanly/parsers";
import type { LocalUrlRiskAnalysis, NormalizedUrl, UrlSafetyPrivacyMode } from "./types.js";
export declare const MAX_URL_LENGTH = 16384;
export declare function normalizeUrl(input: string): NormalizedUrl;
export declare function redactUrl(input: string): string;
/** Extra defense for free text; HTML/LLM evidence is never logged. */
export declare function sanitizeText(input: string, limit?: number): string;
export declare function structuredUrl(payload: StructuredPayload | null | undefined): string | null;
export declare function validateMode(mode: unknown): UrlSafetyPrivacyMode;
export declare class LocalUrlAnalyzer {
    analyze(input: string): LocalUrlRiskAnalysis;
}
//# sourceMappingURL=local.d.ts.map