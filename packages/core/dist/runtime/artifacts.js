export class BoundedFrameArtifactStore {
    maxAllocations;
    maxBytes;
    entries = new Map();
    allocations = 0;
    bytes = 0;
    constructor(maxAllocations, maxBytes) {
        this.maxAllocations = maxAllocations;
        this.maxBytes = maxBytes;
    }
    get allocationCount() { return this.allocations; }
    get retainedBytes() { return this.bytes; }
    get(key) { return this.entries.get(key)?.value; }
    set(key, value, estimatedBytes = 0) {
        const prior = this.entries.get(key);
        const normalizedBytes = Math.max(0, estimatedBytes);
        const nextAllocations = this.allocations - (prior && prior.bytes > 0 ? 1 : 0) + (normalizedBytes > 0 ? 1 : 0);
        const nextBytes = this.bytes - (prior?.bytes ?? 0) + normalizedBytes;
        if (nextAllocations > this.maxAllocations || nextBytes > this.maxBytes) {
            throw Object.assign(new Error("Frame intermediate artifact budget exceeded."), { code: "resource_limit_exceeded" });
        }
        this.entries.set(key, { value, bytes: normalizedBytes });
        this.allocations = nextAllocations;
        this.bytes = nextBytes;
    }
    dispose() { this.entries.clear(); this.allocations = 0; this.bytes = 0; }
}
//# sourceMappingURL=artifacts.js.map