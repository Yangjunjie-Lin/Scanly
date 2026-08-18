/** Optional explainability helper; snapshots contain no payload bytes or pixels. */
export class ScannerDiagnostics {
    static fromResult(result) {
        const value = result.metadata?.scannerDiagnostics;
        return isSnapshot(value) ? value : undefined;
    }
    static explain(snapshot) {
        const explanations = [];
        const recommended = snapshot.difficulty.recommendedRoutes;
        if (recommended.length)
            explanations.push(`Recovery was considered because heuristic diagnosis recommended: ${recommended.join(", ")}.`);
        if (snapshot.routesAttempted.length)
            explanations.push(`Attempted bounded routes: ${snapshot.routesAttempted.join(", ")}.`);
        if (snapshot.routeSucceeded)
            explanations.push(`Validated evidence was confirmed through route: ${snapshot.routeSucceeded}.`);
        if (snapshot.candidateConflictCount)
            explanations.push(`${snapshot.candidateConflictCount} candidate conflict(s) were not silently selected.`);
        if (snapshot.insufficientEvidence)
            explanations.push("No candidate reached sufficient validated evidence.");
        return explanations;
    }
}
function isSnapshot(value) {
    if (!value || typeof value !== "object")
        return false;
    const snapshot = value;
    return Boolean(snapshot.difficulty)
        && Array.isArray(snapshot.routesAttempted)
        && Number.isSafeInteger(snapshot.attemptCount)
        && Number.isSafeInteger(snapshot.processedPixels)
        && Number.isSafeInteger(snapshot.candidateConflictCount)
        && typeof snapshot.insufficientEvidence === "boolean"
        && Array.isArray(snapshot.reasons);
}
//# sourceMappingURL=scanner-diagnostics.js.map