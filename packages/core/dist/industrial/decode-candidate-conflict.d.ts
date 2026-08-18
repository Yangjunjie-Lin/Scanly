import type { DecodeCandidate, DecodeCandidateSet } from "./types.js";
export interface DecodeCandidateResolverOptions {
    temporalObservations?: number;
}
export declare class DecodeCandidateResolver {
    resolve(candidates: readonly DecodeCandidate[], options?: DecodeCandidateResolverOptions): DecodeCandidateSet;
}
//# sourceMappingURL=decode-candidate-conflict.d.ts.map