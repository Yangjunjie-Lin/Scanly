export class FrameMemoryBudget {
    limitBytes;
    bytes = 0;
    peakBytes = 0;
    byKind = { artifact: 0, cache: 0, scratch: 0 };
    leases = new Set();
    constructor(limitBytes) {
        this.limitBytes = limitBytes;
        if (!Number.isFinite(limitBytes) || limitBytes < 1)
            throw new RangeError("Frame memory limit must be positive.");
    }
    get retainedBytes() { return this.bytes; }
    get remainingBytes() { return Math.max(0, this.limitBytes - this.bytes); }
    get observation() {
        return {
            currentControlledBytes: this.bytes,
            peakControlledBytes: this.peakBytes,
            retainedArtifactBytes: this.byKind.artifact,
            retainedCacheBytes: this.byKind.cache,
            transientScratchBytes: this.byKind.scratch,
        };
    }
    reserve(bytes, label, kind = "artifact") {
        const normalized = Math.max(0, Math.ceil(bytes));
        if (this.bytes + normalized > this.limitBytes) {
            throw Object.assign(new Error(`Frame memory budget exceeded while reserving '${label}'.`), {
                code: "resource_limit_exceeded",
                requestedBytes: normalized,
                retainedBytes: this.bytes,
                limitBytes: this.limitBytes,
            });
        }
        const lease = new MemoryLeaseImpl(normalized, label, kind, (released) => {
            if (!this.leases.delete(lease))
                return;
            this.bytes = Math.max(0, this.bytes - released.bytes);
            this.byKind[released.kind] = Math.max(0, this.byKind[released.kind] - released.bytes);
        }, (target, nextKind, priorKind) => {
            if (!this.leases.has(target) || nextKind === priorKind)
                return;
            this.byKind[priorKind] = Math.max(0, this.byKind[priorKind] - target.bytes);
            this.byKind[nextKind] += target.bytes;
        });
        this.bytes += normalized;
        this.byKind[kind] += normalized;
        this.peakBytes = Math.max(this.peakBytes, this.bytes);
        this.leases.add(lease);
        return lease;
    }
    reserveScratch(bytes, label) {
        return this.reserve(bytes, label, "scratch");
    }
    resize(lease, bytes) {
        const target = lease;
        if (!this.leases.has(target) || target.released)
            throw new Error("Cannot resize a released or foreign memory lease.");
        const normalized = Math.max(0, Math.ceil(bytes));
        const delta = normalized - target.bytes;
        if (delta > this.remainingBytes) {
            throw Object.assign(new Error(`Frame memory budget exceeded while resizing '${target.label}'.`), {
                code: "resource_limit_exceeded", requestedBytes: delta, retainedBytes: this.bytes, limitBytes: this.limitBytes,
            });
        }
        this.bytes += delta;
        this.byKind[target.kind] += delta;
        target.setBytes(normalized);
        this.peakBytes = Math.max(this.peakBytes, this.bytes);
    }
    releaseAll() {
        for (const lease of [...this.leases])
            lease.release();
    }
}
class MemoryLeaseImpl {
    onRelease;
    onReclassify;
    done = false;
    byteCount;
    leaseLabel;
    leaseKind;
    constructor(bytes, label, kind, onRelease, onReclassify) {
        this.onRelease = onRelease;
        this.onReclassify = onReclassify;
        this.byteCount = bytes;
        this.leaseLabel = label;
        this.leaseKind = kind;
    }
    get bytes() { return this.byteCount; }
    get label() { return this.leaseLabel; }
    get kind() { return this.leaseKind; }
    get released() { return this.done; }
    setBytes(bytes) { this.byteCount = bytes; }
    reclassify(kind, label) {
        if (this.done)
            throw new Error("Cannot reclassify a released memory lease.");
        const prior = this.leaseKind;
        this.onReclassify(this, kind, prior);
        this.leaseKind = kind;
        if (label)
            this.leaseLabel = label;
    }
    release() {
        if (this.done)
            return;
        this.done = true;
        this.onRelease(this);
    }
}
//# sourceMappingURL=memory-budget.js.map