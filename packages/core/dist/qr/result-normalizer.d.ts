import type { DecodedCode } from "./types.js";
/** Deduplicate decoded results by payload (first occurrence wins). */
export declare function dedupeResults(results: DecodedCode[]): DecodedCode[];
/** True if string looks like http(s) URL. */
export declare function looksLikeUrl(s: string): boolean;
/** Normalize whitespace-only payloads to empty failure candidates. */
export declare function normalizePayload(payload: string): string;
//# sourceMappingURL=result-normalizer.d.ts.map