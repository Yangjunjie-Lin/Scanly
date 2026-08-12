export class RecoveryMemoryAccountant {
    maximumBytes;
    currentBytes = 0;
    peakBytes = 0;
    peakBuffers = 0;
    leases = new Set();
    byKind = {
        candidate: 0, normalized: 0, rectified: 0, warp: 0, grayscale: 0, binary: 0,
    };
    constructor(maximumBytes) {
        this.maximumBytes = maximumBytes;
        if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1)
            throw new RangeError("Recovery memory limit must be a positive integer.");
    }
    reserve(bytes, kind) {
        const normalized = Math.max(0, Math.ceil(bytes));
        if (!Number.isSafeInteger(normalized) || this.currentBytes + normalized > this.maximumBytes) {
            throw Object.assign(new Error(`Recovery memory budget exceeded for ${kind}.`), {
                code: "resource_limit_exceeded", requestedBytes: normalized,
                currentBytes: this.currentBytes, maximumBytes: this.maximumBytes,
            });
        }
        const lease = new Lease(normalized, kind, () => {
            if (!this.leases.delete(lease))
                return;
            this.currentBytes -= lease.bytes;
            this.byKind[lease.kind] -= lease.bytes;
        });
        this.leases.add(lease);
        this.currentBytes += normalized;
        this.byKind[kind] += normalized;
        this.peakBytes = Math.max(this.peakBytes, this.currentBytes);
        this.peakBuffers = Math.max(this.peakBuffers, this.leases.size);
        return lease;
    }
    releaseAll() { for (const lease of [...this.leases])
        lease.release(); }
    get activeBufferCount() { return this.leases.size; }
    get observation() {
        return {
            currentBytes: this.currentBytes,
            peakBytes: this.peakBytes,
            activeBuffers: this.leases.size,
            peakBuffers: this.peakBuffers,
            byKind: { ...this.byKind },
        };
    }
}
class Lease {
    bytes;
    kind;
    onRelease;
    done = false;
    constructor(bytes, kind, onRelease) {
        this.bytes = bytes;
        this.kind = kind;
        this.onRelease = onRelease;
    }
    get released() { return this.done; }
    release() { if (!this.done) {
        this.done = true;
        this.onRelease();
    } }
}
//# sourceMappingURL=memory.js.map