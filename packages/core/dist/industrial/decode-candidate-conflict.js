import { buildScanEvidence, geometryEvidence } from "./scan-evidence.js";
export class DecodeCandidateResolver {
    resolve(candidates, options = {}) {
        const valid = candidates.filter((candidate) => candidate.validation.decoderValidation && candidate.validation.formatStructuralValidity !== false);
        let rejectedCount = candidates.length - valid.length;
        const clusters = spatialClusters(valid);
        const confirmedCandidates = [];
        const conflicts = [];
        for (const cluster of clusters) {
            const groups = groupByPayload(cluster);
            if (groups.length === 1) {
                if (sufficientSingleGroupEvidence(groups[0], options.temporalObservations))
                    confirmedCandidates.push(best(groups[0], options.temporalObservations));
                else
                    rejectedCount += groups[0].length;
                continue;
            }
            const ranked = groups.map((group) => ({ group, candidate: best(group, options.temporalObservations), score: priority(group, options.temporalObservations) })).sort((left, right) => right.score - left.score);
            const winner = ranked[0];
            const runnerUp = ranked[1];
            const winnerChecksum = winner.group.some((candidate) => candidate.validation.checksumValidated === true);
            const runnerChecksum = runnerUp.group.some((candidate) => candidate.validation.checksumValidated === true);
            const winnerRoutes = new Set(winner.group.map((candidate) => candidate.route)).size;
            if ((winnerChecksum && !runnerChecksum && winner.score - runnerUp.score >= 20) || (winnerRoutes >= 2 && winner.score - runnerUp.score >= 25)) {
                confirmedCandidates.push(winner.candidate);
            }
            else {
                const key = cluster.map(candidateKey).sort().join("|");
                const conflict = { key, candidates: cluster, reason: "conflicting payload/format candidates lack decisive independent evidence" };
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
function spatialClusters(candidates) {
    const clusters = [];
    for (const candidate of candidates) {
        const cluster = clusters.find((current) => current.some((entry) => overlaps(entry, candidate)));
        if (cluster)
            cluster.push(candidate);
        else
            clusters.push([candidate]);
    }
    return clusters;
}
function overlaps(left, right) {
    const a = bounds(left.geometry);
    const b = bounds(right.geometry);
    if (!a || !b)
        return true;
    const intersection = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const smaller = Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
    return smaller <= 0 || intersection / smaller >= 0.25;
}
function bounds(points) {
    if (!points?.length)
        return undefined;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}
function groupByPayload(candidates) {
    const groups = new Map();
    for (const candidate of candidates) {
        const key = candidateKey(candidate);
        const group = groups.get(key) ?? [];
        group.push(candidate);
        groups.set(key, group);
    }
    return [...groups.values()];
}
function candidateKey(candidate) { return `${candidate.format}\u0000${candidate.payload}`; }
function sufficientSingleGroupEvidence(group, temporalObservations = 1) {
    const primary = group[0];
    const routeAgreement = new Set(group.map((candidate) => candidate.route)).size;
    if (["qr_code", "data_matrix", "pdf417"].includes(primary.format))
        return true;
    return routeAgreement >= 2 || temporalObservations >= 2;
}
function best(group, temporalObservations = 1) { return [...group].sort((left, right) => candidatePriority(right, temporalObservations) - candidatePriority(left, temporalObservations))[0]; }
function priority(group, temporalObservations = 1) { return candidatePriority(best(group, temporalObservations), temporalObservations) + buildScanEvidence(group, temporalObservations).independentRouteAgreement * 12; }
function candidatePriority(candidate, temporalObservations = 1) {
    return (candidate.validation.checksumValidated === true ? 100 : 0)
        + (candidate.validation.formatStructuralValidity !== false ? 30 : 0)
        + (candidate.validation.decoderValidation ? 30 : 0)
        + Math.min(20, temporalObservations * 4)
        + geometryEvidence(candidate) * 20
        + (candidate.validation.errorCorrectionEvidence ?? 0) * 20;
}
//# sourceMappingURL=decode-candidate-conflict.js.map