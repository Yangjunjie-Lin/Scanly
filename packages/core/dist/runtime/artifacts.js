import { FrameMemoryBudget } from "./memory-budget.js";
export class BoundedFrameArtifactStore {
    maxAllocations;
    entries = new Map();
    allocations = 0;
    bytes = 0;
    memoryBudget;
    constructor(maxAllocations, maxBytes, memoryBudget) {
        this.maxAllocations = maxAllocations;
        this.memoryBudget = memoryBudget ?? new FrameMemoryBudget(maxBytes);
    }
    get allocationCount() { return this.allocations; }
    get retainedBytes() { return this.bytes; }
    get(key) { return this.entries.get(key)?.value; }
    set(key, value, estimatedBytes = 0, suppliedLease) {
        const prior = this.entries.get(key);
        const normalizedBytes = Math.max(0, estimatedBytes);
        const nextAllocations = this.allocations - (prior && prior.bytes > 0 ? 1 : 0) + (normalizedBytes > 0 ? 1 : 0);
        const nextBytes = this.bytes - (prior?.bytes ?? 0) + normalizedBytes;
        if (nextAllocations > this.maxAllocations) {
            throw Object.assign(new Error("Frame intermediate artifact budget exceeded."), { code: "resource_limit_exceeded" });
        }
        let lease = suppliedLease;
        if (lease) {
            if (lease.released || lease.bytes !== normalizedBytes)
                throw new Error(`Supplied artifact lease for '${key}' is invalid.`);
            lease.reclassify("artifact", `artifact:${key}`);
            prior?.lease?.release();
        }
        else if (prior?.lease) {
            this.memoryBudget.resize(prior.lease, normalizedBytes);
            prior.lease.reclassify("artifact", `artifact:${key}`);
            lease = normalizedBytes > 0 ? prior.lease : undefined;
            if (normalizedBytes === 0)
                prior.lease.release();
        }
        else {
            lease = normalizedBytes > 0 ? this.memoryBudget.reserve(normalizedBytes, `artifact:${key}`, "artifact") : undefined;
        }
        this.entries.set(key, { value, bytes: normalizedBytes, lease });
        this.allocations = nextAllocations;
        this.bytes = nextBytes;
    }
    dispose() {
        for (const entry of this.entries.values())
            entry.lease?.release();
        this.entries.clear();
        this.allocations = 0;
        this.bytes = 0;
    }
}
//# sourceMappingURL=artifacts.js.map