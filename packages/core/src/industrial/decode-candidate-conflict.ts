import { buildScanEvidence, geometryEvidence } from "./scan-evidence.js";
import type { DecodeCandidate, DecodeCandidateConflict, DecodeCandidateSet } from "./types.js";

export interface DecodeCandidateResolverOptions { temporalObservations?: number; }

export class DecodeCandidateResolver {
  resolve(candidates: readonly DecodeCandidate[], options: DecodeCandidateResolverOptions = {}): DecodeCandidateSet {
    const valid = candidates.filter((candidate) => candidate.validation.decoderValidation && candidate.validation.formatStructuralValidity !== false);
    const rejectedCount = candidates.length - valid.length;
    const clusters = spatialClusters(valid);
    const confirmedCandidates: DecodeCandidate[] = [];
    const conflicts: DecodeCandidateConflict[] = [];

    for (const cluster of clusters) {
      const groups = groupByPayload(cluster);
      if (groups.length === 1) { confirmedCandidates.push(best(groups[0], options.temporalObservations)); continue; }
      const ranked = groups.map((group) => ({ group, candidate: best(group, options.temporalObservations), score: priority(group, options.temporalObservations) })).sort((left, right) => right.score - left.score);
      const winner = ranked[0]; const runnerUp = ranked[1];
      const winnerChecksum = winner.group.some((candidate) => candidate.validation.checksumValidated === true);
      const runnerChecksum = runnerUp.group.some((candidate) => candidate.validation.checksumValidated === true);
      const winnerRoutes = new Set(winner.group.map((candidate) => candidate.route)).size;
      if ((winnerChecksum && !runnerChecksum && winner.score - runnerUp.score >= 20) || (winnerRoutes >= 2 && winner.score - runnerUp.score >= 25)) {
        confirmedCandidates.push(winner.candidate);
      } else {
        const key = cluster.map(candidateKey).sort().join("|");
        const conflict: DecodeCandidateConflict = { key, candidates: cluster, reason: "conflicting payload/format candidates lack decisive independent evidence" };
        conflicts.push(conflict);
      }
    }

    return {
      candidates: [...candidates],
      ...(confirmedCandidates[0] ? { confirmed: confirmedCandidates[0] } : {}),
      confirmedCandidates,
      conflicts,
      rejectedCount,
    };
  }
}

function spatialClusters(candidates: readonly DecodeCandidate[]): DecodeCandidate[][] {
  const clusters: DecodeCandidate[][] = [];
  for (const candidate of candidates) {
    const cluster = clusters.find((current) => current.some((entry) => overlaps(entry, candidate)));
    if (cluster) cluster.push(candidate); else clusters.push([candidate]);
  }
  return clusters;
}

function overlaps(left: DecodeCandidate, right: DecodeCandidate): boolean {
  const a = bounds(left.geometry); const b = bounds(right.geometry);
  if (!a || !b) return true;
  const intersection = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const smaller = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
  return smaller <= 0 || intersection / smaller >= 0.25;
}

function bounds(points: DecodeCandidate["geometry"]): { left: number; top: number; right: number; bottom: number } | undefined {
  if (!points?.length) return undefined; const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}
function groupByPayload(candidates: readonly DecodeCandidate[]): DecodeCandidate[][] {
  const groups = new Map<string, DecodeCandidate[]>();
  for (const candidate of candidates) { const key = candidateKey(candidate); const group = groups.get(key) ?? []; group.push(candidate); groups.set(key, group); }
  return [...groups.values()];
}
function candidateKey(candidate: DecodeCandidate): string { return `${candidate.format}\u0000${candidate.payload}`; }
function best(group: readonly DecodeCandidate[], temporalObservations = 1): DecodeCandidate { return [...group].sort((left, right) => candidatePriority(right, temporalObservations) - candidatePriority(left, temporalObservations))[0]; }
function priority(group: readonly DecodeCandidate[], temporalObservations = 1): number { return candidatePriority(best(group, temporalObservations), temporalObservations) + buildScanEvidence(group, temporalObservations).independentRouteAgreement * 12; }
function candidatePriority(candidate: DecodeCandidate, temporalObservations = 1): number {
  return (candidate.validation.checksumValidated === true ? 100 : 0)
    + (candidate.validation.formatStructuralValidity !== false ? 30 : 0)
    + (candidate.validation.decoderValidation ? 30 : 0)
    + Math.min(20, temporalObservations * 4)
    + geometryEvidence(candidate) * 20
    + (candidate.validation.errorCorrectionEvidence ?? 0) * 20;
}
