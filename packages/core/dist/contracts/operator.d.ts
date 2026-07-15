export type OperatorBehavior = "deterministic" | "stateful";
export type ThreadSafety = "thread-safe" | "instance-confined" | "single-thread-only";
export interface OperatorCostHint {
    cpu: "low" | "medium" | "high";
    memoryBytes?: number;
    attempts?: number;
}
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
    readonly trace: (stage: string, detail?: string) => void;
}
export interface Operator<I, O, C = unknown> {
    readonly descriptor: OperatorDescriptor;
    execute(input: I, configuration: C, context: OperatorContext): Promise<O>;
}
export interface FrameArtifactStore {
    readonly allocationCount: number;
    readonly retainedBytes: number;
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, estimatedBytes?: number): void;
    dispose(): void;
}
export interface TaskGraphNode {
    id: string;
    dependencies: string[];
    run(context: OperatorContext): Promise<void>;
}
export declare function executeTaskGraph(nodes: TaskGraphNode[], context: OperatorContext, mode?: "sequential" | "parallel"): Promise<void>;
//# sourceMappingURL=operator.d.ts.map