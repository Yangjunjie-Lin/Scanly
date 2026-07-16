export interface MemoryLease {
  readonly bytes: number;
  readonly label: string;
  readonly released: boolean;
  release(): void;
}

export class FrameMemoryBudget {
  private bytes = 0;
  private leases = new Set<MemoryLeaseImpl>();
  constructor(readonly limitBytes: number) {
    if (!Number.isFinite(limitBytes) || limitBytes < 1) throw new RangeError("Frame memory limit must be positive.");
  }

  get retainedBytes(): number { return this.bytes; }
  get remainingBytes(): number { return Math.max(0, this.limitBytes - this.bytes); }

  reserve(bytes: number, label: string): MemoryLease {
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
      if (!this.leases.delete(lease)) return;
      this.bytes = Math.max(0, this.bytes - normalized);
    });
    this.bytes += normalized;
    this.leases.add(lease);
    return lease;
  }

  releaseAll(): void {
    for (const lease of [...this.leases]) lease.release();
  }
}

class MemoryLeaseImpl implements MemoryLease {
  private done = false;
  constructor(readonly bytes: number, readonly label: string, private readonly onRelease: () => void) {}
  get released(): boolean { return this.done; }
  release(): void {
    if (this.done) return;
    this.done = true;
    this.onRelease();
  }
}
