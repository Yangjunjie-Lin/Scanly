import { boundedNumber, withBudget } from "../async.js";
import { normalizeUrl, validateMode } from "../local.js";
import { readJsonBounded } from "../validation.js";
/** Global in-process budget is deliberately not keyed by spoofable forwarding
 * headers. Multi-instance deployments MUST add a shared authenticated limiter. */
export function createUrlSafetyHandler(options) {
    const rate = boundedNumber(options.requestsPerMinute, 30, 10_000);
    const maxConcurrent = boundedNumber(options.maxConcurrent, 4, 100);
    const timeoutMs = boundedNumber(options.timeoutMs, 22_000, 30_000);
    let windowStart = 0;
    let requests = 0;
    let active = 0;
    const respond = (status, body) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 429 ? { "Retry-After": "60" } : {}) } });
    return async (request) => {
        if (request.method !== "POST")
            return respond(405, { error: "method_not_allowed" });
        const origin = request.headers.get("origin");
        if (!origin || !(options.allowedOrigins ?? [new URL(request.url).origin]).includes(origin))
            return respond(403, { error: "origin_not_allowed" });
        if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json")
            return respond(415, { error: "json_required" });
        if (Number(request.headers.get("content-length")) > 24_576)
            return respond(413, { error: "request_size_limit" });
        if (Date.now() - windowStart >= 60_000) {
            windowStart = Date.now();
            requests = 0;
        }
        if (requests >= rate || active >= maxConcurrent)
            return respond(429, { error: "rate_limit" });
        requests++;
        active++;
        try {
            return await withBudget(async (signal) => {
                let data;
                try {
                    data = await readJsonBounded(new Response(request.body), 24_576, signal);
                }
                catch {
                    return respond(400, { error: "invalid_or_oversized_json" });
                }
                if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some((key) => key !== "url" && key !== "mode"))
                    return respond(400, { error: "invalid_request" });
                const body = data;
                let mode;
                let url;
                try {
                    mode = validateMode(body.mode);
                    url = normalizeUrl(body.url).normalizedUrl;
                }
                catch {
                    return respond(400, { error: "invalid_request" });
                }
                if (!(options.allowedModes ?? ["local-only"]).includes(mode))
                    return respond(403, { error: "analysis_mode_not_enabled_on_server" });
                return respond(200, await options.analyzer.analyze(url, { mode, signal }));
            }, timeoutMs, request.signal);
        }
        catch {
            return respond(request.signal.aborted ? 499 : 504, { error: "analysis_cancelled_or_timed_out" });
        }
        finally {
            active--;
        }
    };
}
//# sourceMappingURL=handler.js.map