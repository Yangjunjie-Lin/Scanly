export type OperatorBehavior = "deterministic" | "stateful";
export type ThreadSafety = "thread-safe" | "instance-confined" | "single-thread-only";
export interface OperatorCostHint { cpu: "low" | "medium" | "high"; memoryBytes?: number; attempts?: number }
export interface OperatorDescriptor {
  id: string;
  version: string;
  accepts: readonly string[];
  produces: readonly string[];
  configurationSchemaId: string;
  cost: OperatorCostHint;
  cancellation: "cooperative" | "termination-required" | "not-supported";
  behavior: OperatorBehavior;
  threadSafety: ThreadSafety;
}
export interface OperatorContext {
  readonly signal?: AbortSignal;
  readonly artifacts: FrameArtifactStore;
  readonly budget?: ExecutionBudget;
  readonly phaseTimings?: Record<string, number>;
  readonly trace: (stage: string, detail?: string) => void;
}
export interface Operator<I, O, C = unknown> {
  readonly descriptor: OperatorDescriptor;
  execute(input: I, configuration: C, context: OperatorContext): Promise<O>;
}
export interface FrameArtifactStore {
  readonly allocationCount: number;
  readonly retainedBytes: number;
  readonly memoryBudget: FrameMemoryBudget;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, estimatedBytes?: number, lease?: MemoryLease): void;
  dispose(): void;
}
export interface TaskGraphNode {
  id: string;
  dependencies: string[];
  run(context: OperatorContext): Promise<void>;
}

export async function executeTaskGraph(nodes: TaskGraphNode[], context: OperatorContext, mode: "sequential" | "parallel" = "sequential"): Promise<void> {
  const pending = new Map(nodes.map((node) => [node.id, node]));
  const complete = new Set<string>();
  while (pending.size) {
    if (context.signal?.aborted) throw Object.assign(new Error("Capture graph cancelled."), { name: "AbortError" });
    const ready = [...pending.values()].filter((node) => node.dependencies.every((id) => complete.has(id)));
    if (!ready.length) throw new Error("Capture graph has a cycle or a missing dependency.");
    const batch = mode === "parallel" ? ready : ready.slice(0, 1);
    await Promise.all(batch.map(async (node) => { await node.run(context); pending.delete(node.id); complete.add(node.id); }));
  }
}
import type { ExecutionBudget } from "../runtime/execution-budget.js";
import type { FrameMemoryBudget, MemoryLease } from "../runtime/memory-budget.js";
