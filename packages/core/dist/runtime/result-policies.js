/** Session-scoped, bounded duplicate suppression for continuous sources. */
export class DuplicateSuppressionPolicy {
    windowMs;
    identity;
    seen = new Map();
    maxEntries;
    constructor(windowMs, identity = {}) {
        this.windowMs = windowMs;
        this.identity = identity;
        this.maxEntries = Math.max(1, Math.min(10_000, identity.maxEntries ?? 256));
    }
    updateWindow(windowMs) {
        this.windowMs = Math.max(0, windowMs);
        this.clear();
    }
    filter(outcome, nowMs = Date.now()) {
        this.prune(nowMs);
        if (!outcome.ok || this.windowMs === 0)
            return outcome;
        const results = outcome.results.filter((result) => {
            const key = this.key(result);
            const previous = this.seen.get(key);
            this.seen.delete(key);
            this.seen.set(key, nowMs);
            return previous === undefined || nowMs - previous >= this.windowMs;
        });
        if (!results.length) {
            return {
                ok: false,
                error: { code: "no_symbol_found", category: "input", message: "Results were suppressed by the active duplicate policy.", retryable: true },
                frameId: outcome.frameId,
                scenarioId: outcome.scenarioId,
                attemptCount: outcome.attemptCount,
                timing: outcome.timing,
                ...(outcome.trace ? { trace: outcome.trace } : {}),
                ...(outcome.attempts ? { attempts: outcome.attempts } : {}),
            };
        }
        const nonEmpty = results;
        return { ...outcome, results: nonEmpty, primary: nonEmpty[0] };
    }
    clear() { this.seen.clear(); }
    get size() { return this.seen.size; }
    key(result) {
        return [
            result.rawText,
            this.identity.includeFormat === false ? "" : result.format,
            this.identity.includeSpatialTrack ? result.trackId ?? result.cornerPoints?.map((point) => `${Math.round(point.x)},${Math.round(point.y)}`).join(";") ?? "" : "",
        ].join("\u001f");
    }
    prune(nowMs) {
        for (const [key, at] of this.seen) {
            if (nowMs - at >= this.windowMs || this.seen.size > this.maxEntries)
                this.seen.delete(key);
            else
                break;
        }
        while (this.seen.size >= this.maxEntries)
            this.seen.delete(this.seen.keys().next().value);
    }
}
//# sourceMappingURL=result-policies.js.map