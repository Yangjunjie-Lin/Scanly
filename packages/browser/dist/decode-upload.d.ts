import type { ScanOutcome } from "@scanly/core";
import type { ScenarioDefinition } from "@scanly/scenario-schema";
import { type BrowserScanFileOptions } from "./browser-session.js";
/**
 * @deprecated Prefer BrowserCaptureSession. This compatibility wrapper executes
 * the same CaptureRouter path and no longer owns a separate decode pipeline.
 */
export declare function decodeUploadedFile(file: File, options?: BrowserScanFileOptions & {
    scenario?: ScenarioDefinition;
}): Promise<ScanOutcome>;
export declare function cancelUploadedDecode(): void;
export declare function disposeUploadedDecodeWorker(): Promise<void>;
//# sourceMappingURL=decode-upload.d.ts.map