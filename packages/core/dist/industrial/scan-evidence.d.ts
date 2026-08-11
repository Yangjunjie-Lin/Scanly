import type { DecodeCandidate, ScanEvidence } from "./types.js";
export declare function geometryEvidence(candidate: DecodeCandidate): number;
export declare function buildScanEvidence(candidates: readonly DecodeCandidate[], temporalObservations?: number): ScanEvidence;
export declare function decodeCandidateFromResult(result: import("../contracts/result.js").ScanResult, route: DecodeCandidate["route"], elapsedMs: number): DecodeCandidate;
//# sourceMappingURL=scan-evidence.d.ts.map