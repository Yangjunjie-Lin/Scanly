import type { RemoteInspectionResult } from "../types.js";
export interface RemoteFetcher {
    inspect(url: string, options?: {
        signal?: AbortSignal;
    }): Promise<RemoteInspectionResult>;
}
export declare class SafeRemoteFetcher implements RemoteFetcher {
    private readonly timeoutMs;
    private readonly maxBytes;
    constructor(options?: {
        timeoutMs?: number;
        maxBytes?: number;
    });
    inspect(input: string, options?: {
        signal?: AbortSignal;
    }): Promise<RemoteInspectionResult>;
}
//# sourceMappingURL=fetcher.d.ts.map