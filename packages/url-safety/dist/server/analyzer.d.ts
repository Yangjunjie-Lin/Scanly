import { UrlSafetyCache } from "../cache.js";
import type { LlmSafetyProvider, UrlReputationProvider, UrlSafetyAnalyzer } from "../types.js";
import { type RemoteFetcher } from "./fetcher.js";
export interface UrlSafetyPolicy {
    totalTimeoutMs?: number;
    reputationTimeoutMs?: number;
    remoteTimeoutMs?: number;
    aiTimeoutMs?: number;
}
export declare function createUrlSafetyAnalyzer(config?: {
    reputationProviders?: UrlReputationProvider[];
    llmProvider?: LlmSafetyProvider;
    /** Trusted server extension point. Replacing this also replaces SSRF guarantees. */
    remoteFetcher?: RemoteFetcher;
    policy?: UrlSafetyPolicy;
    cache?: UrlSafetyCache;
}): UrlSafetyAnalyzer;
//# sourceMappingURL=analyzer.d.ts.map