import type { BarcodeFormat, ScenarioDefinition } from "@scanly/scenario-schema";
import type { CornerPoint, ScanOutcome } from "@scanly/core";
export interface InternalTrack {
    id: string;
    payload: string;
    format: BarcodeFormat;
    corners: CornerPoint[];
    firstSeenMs: number;
    lastSeenMs: number;
    consecutiveFrames: number;
    missedFrames: number;
}
export interface CameraEscalationOptions {
    escalationScenario?: ScenarioDefinition;
    fastMissThreshold?: number;
    maximumEscalationAttempts?: number;
    roiExpansion?: number;
    resetTimeoutMs?: number;
}
export declare class CameraEscalationController {
    private readonly options;
    private misses;
    private escalationRemaining;
    private track;
    private sequence;
    constructor(options?: CameraEscalationOptions);
    nextScenario(base?: ScenarioDefinition, frame?: {
        width: number;
        height: number;
    }, now?: number): ScenarioDefinition;
    observe(outcome: ScanOutcome, now?: number): void;
    reset(): void;
    get activeTrack(): Readonly<InternalTrack> | null;
    get escalated(): boolean;
}
//# sourceMappingURL=camera-strategy.d.ts.map