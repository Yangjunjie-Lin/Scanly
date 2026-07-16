import type { FrameArtifactStore } from "../contracts/operator.js";
import { FrameMemoryBudget, type MemoryLease } from "./memory-budget.js";
export declare class BoundedFrameArtifactStore implements FrameArtifactStore {
    private readonly maxAllocations;
    private readonly entries;
    private allocations;
    private bytes;
    readonly memoryBudget: FrameMemoryBudget;
    constructor(maxAllocations: number, maxBytes: number, memoryBudget?: FrameMemoryBudget);
    get allocationCount(): number;
    get retainedBytes(): number;
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, estimatedBytes?: number, suppliedLease?: MemoryLease): void;
    dispose(): void;
}
//# sourceMappingURL=artifacts.d.ts.map