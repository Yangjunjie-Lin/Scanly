export class FrameMemoryBudget {
    limitBytes;
    bytes = 0;
    leases = new Set();
    constructor(limitBytes) {
        this.limitBytes = limitBytes;
        if (!Number.isFinite(limitBytes) || limitBytes < 1)
            throw new RangeError("Frame memory limit must be positive.");
    }
    get retainedBytes() { return this.bytes; }
    get remainingBytes() { return Math.max(0, this.limitBytes - this.bytes); }
    reserve(bytes, label) {
        const normalized = Math.max(0, Math.ceil(bytes));
        if (this.bytes + normalized > this.limitBytes) {
            throw Object.assign(new Error(`Frame memory budget exceeded while reserving '${label}'.`), {
                code: "resource_limit_exceeded",
                requestedBytes: normalized,
                retainedBytes: this.bytes,
                limitBytes: this.limitBytes,
            });
        }
        const lease = new MemoryLeaseImpl(normalized, label, () => {
            if (!this.leases.delete(lease))
                return;
            this.bytes = Math.max(0, this.bytes - normalized);
        });
        this.bytes += normalized;
        this.leases.add(lease);
        return lease;
    }
    releaseAll() {
        for (const lease of [...this.leases])
            lease.release();
    }
}
class MemoryLeaseImpl {
    bytes;
    label;
    onRelease;
    done = false;
    constructor(bytes, label, onRelease) {
        this.bytes = bytes;
        this.label = label;
        this.onRelease = onRelease;
    }
    get released() { return this.done; }
    release() {
        if (this.done)
            return;
        this.done = true;
        this.onRelease();
    }
}
//# sourceMappingURL=memory-budget.js.map