import { sdkError } from "../contracts/errors.js";
import { CandidateRegionDetector } from "./candidate-region.js";
import { mapRecoveryGeometry } from "./coordinate-transform.js";
import { DecodeCandidateResolver } from "./decode-candidate-conflict.js";
import { BarcodeDifficultyAnalyzer } from "./difficulty-diagnosis.js";
import { RecoveryMemoryAccountant } from "./memory.js";
import { RecoveryPlanner, recoveryBudgetFor } from "./recovery-planner.js";
import { registerDefaultRecoveryRoutes } from "./recovery-routes.js";
import { RecoveryRouteRegistry } from "./recovery-route-registry.js";
import { buildScanEvidence, decodeCandidateFromResult } from "./scan-evidence.js";
export class IndustrialRecoveryPipeline {
    routes;
    analyzer;
    detector;
    resolver;
    now;
    constructor(dependencies = {}) {
        this.routes = dependencies.routes ?? registerDefaultRecoveryRoutes();
        this.analyzer = dependencies.analyzer ?? new BarcodeDifficultyAnalyzer();
        this.detector = dependencies.detector ?? new CandidateRegionDetector();
        this.resolver = dependencies.resolver ?? new DecodeCandidateResolver();
        this.now = dependencies.now ?? (() => Date.now());
    }
    async run(frame, decode, options = {}) {
        const startedAt = this.now();
        const profile = options.profile ?? "balanced";
        const sourceMode = options.sourceMode ?? (frame.sourceType === "camera" || frame.sourceType === "video-frame" ? "camera" : "static");
        const budget = options.budget ?? recoveryBudgetFor(profile, sourceMode, frame.width * frame.height);
        const memory = new RecoveryMemoryAccountant(budget.maximumTemporaryBytes ?? 64 * 1024 * 1024);
        const diagnosis = this.analyzer.analyze(frame);
        const candidateRegions = this.detector.detect(frame);
        const context = { diagnosis, profile, sourceMode, budget, framePixels: frame.width * frame.height, memory, candidateRegions, signal: options.signal, startedAt, now: this.now, dpmExperimentalEnabled: options.dpmExperimental === true || profile === "dpm-experimental", excludedRoutes: options.excludedRoutes };
        const plan = new RecoveryPlanner(this.routes).plan(context);
        const routes = [];
        const decodeCandidates = [];
        const reasons = [];
        let recoveryAttempts = 0;
        let processedPixels = 0;
        let normal;
        let successfulRoute;
        try {
            normal = options.normalOutcome ?? await decode(frame, { routeId: "general", signal: options.signal, remainingRecoveryAttempts: budget.maximumAttempts });
            if (normal.ok) {
                const generalCandidates = normal.results.map((result) => decodeCandidateFromResult(result, "general", normal.timing.totalMs));
                const candidateSet = this.resolver.resolve(generalCandidates, { temporalObservations: options.temporalObservations });
                const evidence = buildScanEvidence(generalCandidates, options.temporalObservations);
                const outcome = attachEvidence(normal, evidence, "general", frame.id);
                return { outcome, diagnostics: { diagnosis, plan, routes, attemptedRoutes: [], successfulRoute: "general", attemptCount: 0, processedPixels: 0, elapsedMs: this.now() - startedAt, candidateSet, evidence, insufficientEvidence: false, reasons }, memory: memory.observation };
            }
            for (const entry of plan.entries) {
                if (options.signal?.aborted || recoveryAttempts >= budget.maximumAttempts || exceededTime(startedAt, budget.maximumTotalMs, this.now))
                    break;
                const route = this.routes.get(entry.routeId);
                if (!route)
                    continue;
                const routeStarted = this.now();
                let routePixels = 0;
                let routeAttempts = 0;
                let routeSuccess = false;
                let candidates = [];
                try {
                    candidates = await route.run(frame, context);
                    if (candidates.length === 0)
                        reasons.push(`${route.id}:insufficient-observable-evidence`);
                    for (const candidate of candidates) {
                        if (options.signal?.aborted || recoveryAttempts >= budget.maximumAttempts || exceededTime(startedAt, budget.maximumTotalMs, this.now))
                            break;
                        if (processedPixels + candidate.pixelsProcessed > budget.maximumPixelsProcessed) {
                            reasons.push(`${route.id}:pixel-budget`);
                            break;
                        }
                        recoveryAttempts += 1;
                        routeAttempts += 1;
                        processedPixels += candidate.pixelsProcessed;
                        routePixels += candidate.pixelsProcessed;
                        const outcome = await decode(candidate.frame, { routeId: route.id, signal: options.signal, remainingRecoveryAttempts: budget.maximumAttempts - recoveryAttempts });
                        if (!outcome.ok)
                            continue;
                        routeSuccess = true;
                        for (const result of outcome.results) {
                            const mapped = mapResult(result, candidate, frame.id);
                            decodeCandidates.push(decodeCandidateFromResult(mapped, route.id, outcome.timing.totalMs));
                        }
                    }
                }
                finally {
                    for (const candidate of candidates)
                        candidate.dispose();
                }
                routes.push({ route: route.id, attempts: routeAttempts, candidates: candidates.length, pixelsProcessed: routePixels, elapsedMs: this.now() - routeStarted, success: routeSuccess });
            }
            const candidateSet = this.resolver.resolve(decodeCandidates, { temporalObservations: options.temporalObservations });
            if (!candidateSet.confirmedCandidates.length) {
                if (candidateSet.conflicts.length)
                    reasons.push("candidate-conflict-unresolved");
                const failed = recoveryFailure(normal, frame.id, recoveryAttempts, this.now() - startedAt);
                return { outcome: failed, diagnostics: { diagnosis, plan, routes, attemptedRoutes: routes.map((route) => route.route), attemptCount: recoveryAttempts, processedPixels, elapsedMs: this.now() - startedAt, candidateSet, insufficientEvidence: true, reasons }, memory: finalMemory(memory) };
            }
            const confirmedKeys = new Set(candidateSet.confirmedCandidates.map((candidate) => `${candidate.format}\u0000${candidate.payload}`));
            const confirmed = decodeCandidates.filter((candidate) => confirmedKeys.has(`${candidate.format}\u0000${candidate.payload}`));
            const evidence = buildScanEvidence(confirmed, options.temporalObservations);
            successfulRoute = candidateSet.confirmed?.route;
            const uniqueResults = deduplicate(confirmed.map((candidate) => attachResultEvidence(candidate.result, evidence, candidate.route, frame.id)));
            const outcome = { ok: true, results: uniqueResults, primary: uniqueResults[0], frameId: frame.id, scenarioId: `industrial-${profile}`, attemptCount: (normal.attemptCount ?? 0) + recoveryAttempts, timing: { totalMs: this.now() - startedAt } };
            return { outcome, diagnostics: { diagnosis, plan, routes, attemptedRoutes: routes.map((route) => route.route), ...(successfulRoute ? { successfulRoute } : {}), attemptCount: recoveryAttempts, processedPixels, elapsedMs: this.now() - startedAt, candidateSet, evidence, insufficientEvidence: false, reasons }, memory: finalMemory(memory) };
        }
        finally {
            memory.releaseAll();
        }
    }
}
function mapResult(result, candidate, frameId) {
    const cornerPoints = mapRecoveryGeometry(result.cornerPoints, candidate.transform);
    return { ...result, frameId, ...(cornerPoints ? { cornerPoints } : { cornerPoints: undefined }), preprocessingPath: [...result.preprocessingPath, `recovery:${candidate.routeId}`], metadata: { ...result.metadata, recoveryRoute: candidate.routeId, originalFrameGeometry: true, recoveryDiagnostics: candidate.diagnostics } };
}
function attachEvidence(outcome, evidence, route, frameId) {
    const results = outcome.results.map((result) => attachResultEvidence(result, evidence, route, frameId));
    return { ...outcome, results, primary: results[0], frameId };
}
function attachResultEvidence(result, evidence, route, frameId) { return { ...result, frameId, metadata: { ...result.metadata, recoveryRoute: route, scanEvidence: evidence, evidenceScoreIsCalibratedProbability: false } }; }
function recoveryFailure(normal, frameId, recoveryAttempts, totalMs) { return { ...normal, error: sdkError("no_symbol_found", "No recovery candidate reached sufficient validated evidence."), frameId, attemptCount: normal.attemptCount + recoveryAttempts, timing: { ...normal.timing, totalMs } }; }
function exceededTime(startedAt, maximumTotalMs, now) { return maximumTotalMs !== undefined && now() - startedAt >= maximumTotalMs; }
function deduplicate(results) { const seen = new Set(); return results.filter((result) => { const geometry = result.cornerPoints?.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(";") ?? ""; const key = `${result.format}\u0000${result.rawText}\u0000${geometry}`; if (seen.has(key))
    return false; seen.add(key); return true; }); }
function finalMemory(memory) { const peakBytes = memory.observation.peakBytes; const peakBuffers = memory.observation.peakBuffers; memory.releaseAll(); return { ...memory.observation, peakBytes, peakBuffers }; }
//# sourceMappingURL=recovery-pipeline.js.map