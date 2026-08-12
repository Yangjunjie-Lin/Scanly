import type { ScanResult } from "../contracts/result.js";
import type { BarcodeDifficultyDiagnosis, RecoveryRouteId, ScanEvidence } from "./types.js";
export interface ScannerRecoveryDiagnosticSnapshot {
    difficulty: BarcodeDifficultyDiagnosis;
    routesAttempted: RecoveryRouteId[];
    routeSucceeded?: RecoveryRouteId;
    attemptCount: number;
    processedPixels: number;
    candidateConflictCount: number;
    evidence?: ScanEvidence;
    insufficientEvidence: boolean;
    reasons: string[];
}
/** Optional explainability helper; snapshots contain no payload bytes or pixels. */
export declare class ScannerDiagnostics {
    static fromResult(result: ScanResult): ScannerRecoveryDiagnosticSnapshot | undefined;
    static explain(snapshot: ScannerRecoveryDiagnosticSnapshot): string[];
}
//# sourceMappingURL=scanner-diagnostics.d.ts.map