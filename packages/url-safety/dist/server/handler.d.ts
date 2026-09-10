import type { UrlSafetyAnalyzer, UrlSafetyPrivacyMode } from "../types.js";
/** Global in-process budget is deliberately not keyed by spoofable forwarding
 * headers. Multi-instance deployments MUST add a shared authenticated limiter. */
export declare function createUrlSafetyHandler(options: {
    analyzer: UrlSafetyAnalyzer;
    allowedOrigins?: string[];
    allowedModes?: UrlSafetyPrivacyMode[];
    requestsPerMinute?: number;
    maxConcurrent?: number;
    timeoutMs?: number;
}): (request: Request) => Promise<Response>;
//# sourceMappingURL=handler.d.ts.map