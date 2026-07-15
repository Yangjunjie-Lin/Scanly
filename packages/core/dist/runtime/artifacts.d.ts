import type { FrameArtifactStore } from "../contracts/operator.js";
export declare class BoundedFrameArtifactStore implements FrameArtifactStore {
    private readonly maxAllocations;
    private readonly maxBytes;
    private readonly entries;
    private allocations;
    private bytes;
    constructor(maxAllocations: number, maxBytes: number);
    get allocationCount(): number;
    get retainedBytes(): number;
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, estimatedBytes?: number): void;
    dispose(): void;
}
//# sourceMappingURL=artifacts.d.ts.map