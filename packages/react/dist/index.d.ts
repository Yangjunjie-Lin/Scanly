import { BrowserCaptureSession, type BrowserCaptureSessionOptions, type BrowserScanFileOptions } from "@scanly/browser";
import type { ScanOutcome } from "@scanly/core";
export interface UseScanlyResult {
    session: BrowserCaptureSession;
    outcome: ScanOutcome | null;
    scanning: boolean;
    scanFile(file: File, options?: BrowserScanFileOptions): Promise<ScanOutcome>;
    cancel(): void;
    reset(): void;
}
export declare function useScanly(options?: BrowserCaptureSessionOptions): UseScanlyResult;
//# sourceMappingURL=index.d.ts.map