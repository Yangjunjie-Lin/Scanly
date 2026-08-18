export interface MemoryLease {
  readonly bytes: number;
  readonly label: string;
  readonly kind: MemoryLeaseKind;
  readonly released: boolean;
  reclassify(kind: MemoryLeaseKind, label?: string): void;
  release(): void;
}

export type MemoryLeaseKind = "artifact" | "cache" | "scratch";

export interface MemoryObservation {
  currentControlledBytes: number;
  peakControlledBytes: number;
  retainedArtifactBytes: number;
  retainedCacheBytes: number;
  transientScratchBytes: number;
}

export class FrameMemoryBudget {
  private bytes = 0;
  private peakBytes = 0;
  private readonly byKind: Record<MemoryLeaseKind, number> = { artifact: 0, cache: 0, scratch: 0 };
  private leases = new Set<MemoryLeaseImpl>();
  constructor(readonly limitBytes: number) {
    if (!Number.isFinite(limitBytes) || limitBytes < 1) throw new RangeError("Frame memory limit must be positive.");
  }

  get retainedBytes(): number { return this.bytes; }
  get remainingBytes(): number { return Math.max(0, this.limitBytes - this.bytes); }
  get observation(): MemoryObservation {
    return {
      currentControlledBytes: this.bytes,
      peakControlledBytes: this.peakBytes,
      retainedArtifactBytes: this.byKind.artifact,
      retainedCacheBytes: this.byKind.cache,
      transientScratchBytes: this.byKind.scratch,
    };
  }

  reserve(bytes: number, label: string, kind: MemoryLeaseKind = "artifact"): MemoryLease {
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
      if (!this.leases.delete(lease)) return;
      this.bytes = Math.max(0, this.bytes - released.bytes);
      this.byKind[released.kind] = Math.max(0, this.byKind[released.kind] - released.bytes);
    }, (target, nextKind, priorKind) => {
      if (!this.leases.has(target) || nextKind === priorKind) return;
      this.byKind[priorKind] = Math.max(0, this.byKind[priorKind] - target.bytes);
      this.byKind[nextKind] += target.bytes;
    });
    this.bytes += normalized;
    this.byKind[kind] += normalized;
    this.peakBytes = Math.max(this.peakBytes, this.bytes);
    this.leases.add(lease);
    return lease;
  }

  reserveScratch(bytes: number, label: string): MemoryLease {
    return this.reserve(bytes, label, "scratch");
  }

  resize(lease: MemoryLease, bytes: number): void {
    const target = lease as MemoryLeaseImpl;
    if (!this.leases.has(target) || target.released) throw new Error("Cannot resize a released or foreign memory lease.");
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

  releaseAll(): void {
    for (const lease of [...this.leases]) lease.release();
  }
}

class MemoryLeaseImpl implements MemoryLease {
  private done = false;
  private byteCount: number;
  private leaseLabel: string;
  private leaseKind: MemoryLeaseKind;
  constructor(bytes: number, label: string, kind: MemoryLeaseKind, private readonly onRelease: (lease: MemoryLeaseImpl) => void, private readonly onReclassify: (lease: MemoryLeaseImpl, next: MemoryLeaseKind, prior: MemoryLeaseKind) => void) {
    this.byteCount = bytes;
    this.leaseLabel = label;
    this.leaseKind = kind;
  }
  get bytes(): number { return this.byteCount; }
  get label(): string { return this.leaseLabel; }
  get kind(): MemoryLeaseKind { return this.leaseKind; }
  get released(): boolean { return this.done; }
  setBytes(bytes: number): void { this.byteCount = bytes; }
  reclassify(kind: MemoryLeaseKind, label?: string): void {
    if (this.done) throw new Error("Cannot reclassify a released memory lease.");
    const prior = this.leaseKind;
    this.onReclassify(this, kind, prior);
    this.leaseKind = kind;
    if (label) this.leaseLabel = label;
  }
  release(): void {
    if (this.done) return;
    this.done = true;
    this.onRelease(this);
  }
}
