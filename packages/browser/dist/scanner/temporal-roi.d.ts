import type { ScanResult } from "@scanly/core";
import type { TemporalROIHint } from "./types.js";
export interface TemporalROIOptions {
    expansion?: number;
    maximumMisses?: number;
    timeoutMs?: number;
}
export declare class TemporalROI {
    private readonly options;
    private state;
    constructor(options?: TemporalROIOptions);
    update(result: ScanResult, frame: {
        width: number;
        height: number;
        orientation: number;
    }, now?: number): void;
    hint(frame: {
        width: number;
        height: number;
        orientation: number;
    }, now?: number): TemporalROIHint | undefined;
    miss(): void;
    reset(): void;
    get active(): boolean;
    get missCount(): number;
}
//# sourceMappingURL=temporal-roi.d.ts.map