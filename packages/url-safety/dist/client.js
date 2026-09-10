import { boundedNumber, withBudget } from "./async.js";
import { UrlSafetyCache } from "./cache.js";
import { LocalUrlAnalyzer, normalizeUrl, validateMode } from "./local.js";
import { UrlRiskEngine } from "./risk-engine.js";
export class UrlSafetyClient {
    options;
    cache;
    timeoutMs;
    constructor(options) {
        this.options = options;
        if (!options.endpoint.startsWith("/") || options.endpoint.startsWith("//") || /[\\#]/.test(options.endpoint))
            throw new Error("url_safety_endpoint_must_be_same_origin_path");
        this.cache = options.cache ?? new UrlSafetyCache();
        this.timeoutMs = boundedNumber(options.timeoutMs, 25_000, 60_000);
    }
    analyze(input, options = {}) {
        const mode = validateMode(options.mode);
        const url = normalizeUrl(input).normalizedUrl;
        return this.cache.run(url, mode, async (signal) => {
            const local = new LocalUrlAnalyzer().analyze(url);
            if (mode === "local-only")
                return new UrlRiskEngine().aggregate(local);
            return withBudget(async (boundedSignal) => {
                // This fixed application endpoint is the only browser network destination.
                const response = await fetch(this.options.endpoint, { method: "POST", credentials: "omit", redirect: "error", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, mode }), signal: boundedSignal });
                if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
                    throw new Error("url_safety_endpoint_unavailable");
                const { readJsonBounded, validateAnalysis } = await import("./validation.js");
                const value = await readJsonBounded(response, 128 * 1024);
                return validateAnalysis(value);
            }, this.timeoutMs, signal);
        }, options.signal);
    }
    dispose() { this.cache.clear(); }
}
//# sourceMappingURL=client.js.map