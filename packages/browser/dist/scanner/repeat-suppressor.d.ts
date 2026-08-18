import type { DecodedBarcode } from "@scanly/core";
import type { BarcodeGeometry, RepeatPolicy } from "./types.js";
export interface RepeatDecision {
    emit: boolean;
    physicalInstanceId: string;
    reason?: string;
}
export declare class RepeatSuppressor {
    private policy;
    private records;
    private sequence;
    private oncePayloads;
    constructor(policy?: RepeatPolicy);
    evaluate(barcode: DecodedBarcode, geometry: BarcodeGeometry | undefined, now?: number): RepeatDecision;
    updatePolicy(policy: RepeatPolicy): void;
    reset(): void;
    get size(): number;
    private create;
    private closest;
    private distance;
    private prune;
}
//# sourceMappingURL=repeat-suppressor.d.ts.map