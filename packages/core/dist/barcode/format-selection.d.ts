import type { BarcodeFormat } from "@scanly/scenario-schema";
export interface FormatSelection {
    formats: readonly BarcodeFormat[];
    strict?: boolean;
}
export interface NormalizedFormatSelection {
    readonly formats: readonly BarcodeFormat[];
    readonly strict: boolean;
}
export declare function normalizeFormatSelection(selection?: FormatSelection | readonly BarcodeFormat[]): NormalizedFormatSelection;
export declare function assertFormatsSupported(requested: readonly BarcodeFormat[], supported: readonly BarcodeFormat[], engineId: string): void;
//# sourceMappingURL=format-selection.d.ts.map