export type RecoveryBufferKind = "candidate" | "normalized" | "rectified" | "warp" | "grayscale" | "binary";

export interface RecoveryMemoryObservation {
  currentBytes: number;
  peakBytes: number;
  activeBuffers: number;
  peakBuffers: number;
  byKind: Readonly<Record<RecoveryBufferKind, number>>;
}

export interface RecoveryMemoryLease {
  readonly bytes: number;
  readonly kind: RecoveryBufferKind;
  readonly released: boolean;
  release(): void;
}

export class RecoveryMemoryAccountant {
  private currentBytes = 0;
  private peakBytes = 0;
  private peakBuffers = 0;
  private readonly leases = new Set<Lease>();
  private readonly byKind: Record<RecoveryBufferKind, number> = {
    candidate: 0, normalized: 0, rectified: 0, warp: 0, grayscale: 0, binary: 0,
  };

  constructor(readonly maximumBytes: number) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new RangeError("Recovery memory limit must be a positive integer.");
  }

  reserve(bytes: number, kind: RecoveryBufferKind): RecoveryMemoryLease {
    const normalized = Math.max(0, Math.ceil(bytes));
    if (!Number.isSafeInteger(normalized) || this.currentBytes + normalized > this.maximumBytes) {
      throw Object.assign(new Error(`Recovery memory budget exceeded for ${kind}.`), {
        code: "resource_limit_exceeded", requestedBytes: normalized,
        currentBytes: this.currentBytes, maximumBytes: this.maximumBytes,
      });
    }
    const lease = new Lease(normalized, kind, () => {
      if (!this.leases.delete(lease)) return;
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

  releaseAll(): void { for (const lease of [...this.leases]) lease.release(); }
  get activeBufferCount(): number { return this.leases.size; }
  get observation(): RecoveryMemoryObservation {
    return {
      currentBytes: this.currentBytes,
      peakBytes: this.peakBytes,
      activeBuffers: this.leases.size,
      peakBuffers: this.peakBuffers,
      byKind: { ...this.byKind },
    };
  }
}

class Lease implements RecoveryMemoryLease {
  private done = false;
  constructor(readonly bytes: number, readonly kind: RecoveryBufferKind, private readonly onRelease: () => void) {}
  get released(): boolean { return this.done; }
  release(): void { if (!this.done) { this.done = true; this.onRelease(); } }
}
