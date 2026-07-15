import type { CandidateImage } from "./candidate-generation.js";
/** Lightweight geometry fingerprint (no pixel hash or full-buffer scan). */
export declare function candidateFingerprint(c: CandidateImage): string;
/** Drop near-duplicate candidates while preserving first (higher-priority) occurrence. */
export declare function dedupeCandidates(candidates: CandidateImage[]): CandidateImage[];
//# sourceMappingURL=candidate-dedupe.d.ts.map