import { type ScenarioDefinition } from "@scanly/scenario-schema";
import { type NormalizedFrame } from "../contracts/frame.js";
import type { DebugTraceEvent, ScanOutcome } from "../contracts/result.js";
import type { DecodeOutcome, PipelineConfig } from "../qr/types.js";
export declare function scenarioToPipelineConfig(scenario: ScenarioDefinition): Partial<PipelineConfig>;
export declare function mapLegacyQrOutcome(frameId: string, scenario: ScenarioDefinition, outcome: DecodeOutcome, trace?: DebugTraceEvent[]): ScanOutcome;
export declare function createExternalTextOutcome(frameId: string, scenario: ScenarioDefinition, text: string, engine: {
    id: string;
    version: string;
}, elapsedMs: number): ScanOutcome;
export interface CaptureRouterOptions {
    scenario?: ScenarioDefinition;
    now?: () => number;
}
export declare class CaptureRouter {
    private scenario;
    private readonly now;
    private readonly qrOperator;
    private activeFrames;
    constructor(options?: CaptureRouterOptions);
    updateScenario(scenario: ScenarioDefinition): void;
    getScenario(): ScenarioDefinition;
    scan(frame: NormalizedFrame, options?: {
        signal?: AbortSignal;
        scenario?: ScenarioDefinition;
    }): Promise<ScanOutcome>;
}
//# sourceMappingURL=router.d.ts.map