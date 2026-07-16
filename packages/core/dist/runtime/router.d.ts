import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type NormalizedFrame } from "../contracts/frame.js";
import type { ScanOutcome } from "../contracts/result.js";
import { EngineRegistry } from "./engine-registry.js";
import { OperatorRegistry } from "./operator-registry.js";
import { ScenarioCompiler } from "./scenario-compiler.js";
import { scenarioToPipelineConfig } from "./scenario-runtime.js";
import { ValidatorRegistry } from "./validator-registry.js";
export interface CaptureRouterOptions {
    scenario?: ScenarioDefinition;
    engines?: EngineRegistry;
    operators?: OperatorRegistry;
    validators?: ValidatorRegistry;
    compiler?: ScenarioCompiler;
    now?: () => number;
}
export declare class CaptureRouter {
    private scenario;
    private readonly now;
    readonly engines: EngineRegistry;
    readonly operators: OperatorRegistry;
    readonly validators: ValidatorRegistry;
    readonly compiler: ScenarioCompiler;
    private activeFrames;
    private disposed;
    constructor(options?: CaptureRouterOptions);
    updateScenario(scenario: ScenarioDefinition): void;
    getScenario(): ScenarioDefinition;
    scan(frame: NormalizedFrame, options?: {
        signal?: AbortSignal;
        scenario?: ScenarioDefinition;
    }): Promise<ScanOutcome>;
    dispose(): Promise<void>;
    private assertUsable;
}
export { scenarioToPipelineConfig };
//# sourceMappingURL=router.d.ts.map