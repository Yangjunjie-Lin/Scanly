import { UrlSafetyCache } from "./cache.js";
import type { AnalyzeOptions, UrlSafetyAnalysis, UrlSafetyAnalyzer } from "./types.js";
export declare class UrlSafetyClient implements UrlSafetyAnalyzer {
    private readonly options;
    private readonly cache;
    private readonly timeoutMs;
    constructor(options: {
        endpoint: string;
        cache?: UrlSafetyCache;
        timeoutMs?: number;
    });
    analyze(input: string, options?: AnalyzeOptions): Promise<UrlSafetyAnalysis>;
    dispose(): void;
}
//# sourceMappingURL=client.d.ts.map