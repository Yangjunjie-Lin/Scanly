import type { UrlSafetyAnalysis, UrlSafetyPrivacyMode } from "./types.js";
export declare function urlSafetyCacheKey(url: string): Promise<string>;
export declare class UrlSafetyCache {
    private readonly entries;
    private readonly ttlMs;
    private readonly maxEntries;
    constructor(options?: {
        ttlMs?: number;
        maxEntries?: number;
    });
    run(url: string, mode: UrlSafetyPrivacyMode, work: (signal: AbortSignal) => Promise<UrlSafetyAnalysis>, signal?: AbortSignal): Promise<UrlSafetyAnalysis>;
    clear(): void;
}
//# sourceMappingURL=cache.d.ts.map