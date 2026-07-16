import type { FrameArtifactStore } from "../contracts/operator.js";
import { FrameMemoryBudget, type MemoryLease } from "./memory-budget.js";

export class BoundedFrameArtifactStore implements FrameArtifactStore {
  private readonly entries = new Map<string, { value: unknown; bytes: number; lease?: MemoryLease }>();
  private allocations = 0;
  private bytes = 0;
  readonly memoryBudget: FrameMemoryBudget;
  constructor(private readonly maxAllocations: number, maxBytes: number, memoryBudget?: FrameMemoryBudget) {
    this.memoryBudget = memoryBudget ?? new FrameMemoryBudget(maxBytes);
  }
  get allocationCount(): number { return this.allocations; }
  get retainedBytes(): number { return this.bytes; }
  get<T>(key: string): T | undefined { return this.entries.get(key)?.value as T | undefined; }
  set<T>(key: string, value: T, estimatedBytes = 0): void {
    const prior = this.entries.get(key);
    const normalizedBytes = Math.max(0, estimatedBytes);
    const nextAllocations = this.allocations - (prior && prior.bytes > 0 ? 1 : 0) + (normalizedBytes > 0 ? 1 : 0);
    const nextBytes = this.bytes - (prior?.bytes ?? 0) + normalizedBytes;
    if (nextAllocations > this.maxAllocations) {
      throw Object.assign(new Error("Frame intermediate artifact budget exceeded."), { code: "resource_limit_exceeded" });
    }
    const lease = normalizedBytes > 0 ? this.memoryBudget.reserve(normalizedBytes, `artifact:${key}`) : undefined;
    prior?.lease?.release();
    this.entries.set(key, { value, bytes: normalizedBytes, lease });
    this.allocations = nextAllocations;
    this.bytes = nextBytes;
  }
  dispose(): void {
    for (const entry of this.entries.values()) entry.lease?.release();
    this.entries.clear();
    this.allocations = 0;
    this.bytes = 0;
  }
}
