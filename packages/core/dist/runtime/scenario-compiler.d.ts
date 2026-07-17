import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type OperatorContext, type TaskGraphNode } from "../contracts/operator.js";
import { type RuntimeOperatorConfiguration } from "./builtin-operators.js";
import type { EngineRegistry } from "./engine-registry.js";
import type { OperatorRegistry } from "./operator-registry.js";
import type { ValidatorRegistry } from "./validator-registry.js";
export declare class CompiledScenarioGraph {
    readonly scenario: ScenarioDefinition;
    readonly nodes: readonly TaskGraphNode[];
    private readonly configuration;
    constructor(scenario: ScenarioDefinition, nodes: readonly TaskGraphNode[], configuration: RuntimeOperatorConfiguration);
    execute(context: OperatorContext): Promise<void>;
    getConfiguration(): Readonly<RuntimeOperatorConfiguration>;
}
export interface ScenarioCompilerOptions {
    maxCacheEntries?: number;
}
export declare class ScenarioCompiler {
    private readonly operators;
    private readonly engines;
    private readonly validators;
    private readonly cache;
    private readonly maxCacheEntries;
    constructor(operators: OperatorRegistry, engines: EngineRegistry, validators: ValidatorRegistry, options?: ScenarioCompilerOptions);
    compile(input: ScenarioDefinition): CompiledScenarioGraph;
    clearCache(): void;
    get cacheSize(): number;
    private validateCapabilities;
    private validateGraph;
    private cacheKey;
}
//# sourceMappingURL=scenario-compiler.d.ts.map