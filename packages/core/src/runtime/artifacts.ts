import type { FrameArtifactStore } from "../contracts/operator.js";

export class BoundedFrameArtifactStore implements FrameArtifactStore {
  private readonly entries = new Map<string, { value: unknown; bytes: number }>();
  private allocations = 0;
  private bytes = 0;
  constructor(private readonly maxAllocations: number, private readonly maxBytes: number) {}
  get allocationCount(): number { return this.allocations; }
  get retainedBytes(): number { return this.bytes; }
  get<T>(key: string): T | undefined { return this.entries.get(key)?.value as T | undefined; }
  set<T>(key: string, value: T, estimatedBytes = 0): void {
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
  dispose(): void { this.entries.clear(); this.allocations = 0; this.bytes = 0; }
}
