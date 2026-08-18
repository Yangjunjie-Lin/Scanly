import type { DecodedCode } from "./types.js";
export type ResultDeduplicationPolicy = "payload" | "payload-format" | "payload-format-spatial" | "tracked-instance";
/** Deduplicate semantic results while preserving geometry-proven physical instances. */
export declare function dedupeResults(results: DecodedCode[], policy?: ResultDeduplicationPolicy): DecodedCode[];
/** True if string looks like http(s) URL. */
export declare function looksLikeUrl(s: string): boolean;
/** Normalize whitespace-only payloads to empty failure candidates. */
export declare function normalizePayload(payload: string): string;
//# sourceMappingURL=result-normalizer.d.ts.map