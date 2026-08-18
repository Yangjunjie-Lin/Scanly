import type { ScenarioDefinition } from "@scanly/scenario-schema";
import type { EngineRegistry } from "./engine-registry.js";
import { OperatorRegistry } from "./operator-registry.js";
import type { ValidatorRegistry } from "./validator-registry.js";
export declare const BUILTIN_OPERATOR_IDS: readonly ["scanly.frame-normalization", "scanly.roi", "scanly.localization", "scanly.candidate-generation", "scanly.candidate-deduplication", "scanly.enhancement-plan", "scanly.geometry", "scanly.decoder-execution", "scanly.result-aggregation", "scanly.validation", "scanly.semantic-parsing"];
export interface RuntimeOperatorConfiguration {
    scenario: ScenarioDefinition;
    engines: EngineRegistry;
    validators: ValidatorRegistry;
}
export declare function createDefaultOperatorRegistry(): OperatorRegistry;
//# sourceMappingURL=builtin-operators.d.ts.map