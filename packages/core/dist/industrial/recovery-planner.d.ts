import type { RecoveryBudget, RecoveryContext, RecoveryPlan, RecoveryProfile, RecoverySourceMode } from "./types.js";
import { RecoveryRouteRegistry } from "./recovery-route-registry.js";
export declare function recoveryBudgetFor(profile: RecoveryProfile, sourceMode: RecoverySourceMode, framePixels: number): RecoveryBudget;
export declare class RecoveryPlanner {
    private readonly registry;
    constructor(registry: RecoveryRouteRegistry);
    plan(context: RecoveryContext): RecoveryPlan;
}
export declare function validateBudget(value: RecoveryBudget): void;
//# sourceMappingURL=recovery-planner.d.ts.map