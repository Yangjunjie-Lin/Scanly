import type { Operator } from "../contracts/operator.js";
export declare class OperatorRegistry {
    private readonly operators;
    register<I, O, C>(operator: Operator<I, O, C>, options?: {
        replace?: boolean;
    }): void;
    unregister(id: string): void;
    get<I = unknown, O = unknown, C = unknown>(id: string): Operator<I, O, C> | undefined;
    list(): readonly Operator<unknown, unknown, unknown>[];
}
//# sourceMappingURL=operator-registry.d.ts.map