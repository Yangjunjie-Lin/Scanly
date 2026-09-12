import { boundedNumber, throwIfAborted, withBudget } from "../async.js";
import { UrlSafetyCache } from "../cache.js";
import { LocalUrlAnalyzer, redactUrl, sanitizeText, validateMode } from "../local.js";
import { UrlRiskEngine } from "../risk-engine.js";
import { validateAi, validateReputation } from "../validation.js";
import { SafeRemoteFetcher } from "./fetcher.js";
export function createUrlSafetyAnalyzer(config = {}) {
    const policy = config.policy ?? {};
    const budgets = { total: boundedNumber(policy.totalTimeoutMs, 20_000, 30_000), reputation: boundedNumber(policy.reputationTimeoutMs, 2_000, 3_000), remote: boundedNumber(policy.remoteTimeoutMs, 5_000, 8_000), ai: boundedNumber(policy.aiTimeoutMs, 10_000, 15_000) };
    const providers = [...(config.reputationProviders ?? [])];
    if (providers.length > 16 || new Set(providers.map((provider) => provider.id)).size !== providers.length || providers.some((provider) => !/^[\w.-]{1,64}$/.test(provider.id)))
        throw new Error("invalid_reputation_provider_configuration");
    const cache = config.cache ?? new UrlSafetyCache();
    const fetcher = config.remoteFetcher ?? new SafeRemoteFetcher();
    return {
        analyze(input, options = {}) {
            const mode = validateMode(options.mode);
            const local = new LocalUrlAnalyzer().analyze(input);
            return cache.run(local.normalizedUrl, mode, async (signal) => {
                const engine = new UrlRiskEngine();
                if (mode === "local-only")
                    return engine.aggregate(local);
                const evidence = { partial: false, networkRequested: true, privacy: { remoteAnalysisUsed: false, fullUrlShared: false, pageContentSharedWithLlm: false } };
                const original = new URL(local.normalizedUrl);
                // Embedded credentials never leave the process, regardless of mode.
                if (original.username || original.password)
                    return engine.aggregate(local, { partial: true, remote: { status: "blocked", reason: "remote_inspection_credentials_blocked", redirectChain: [], bytesRead: 0 } });
                try {
                    await withBudget(async (totalSignal) => {
                        const reputation = async () => {
                            const results = [];
                            evidence.reputation = { status: "partial", results };
                            await Promise.all(providers.map(async (provider) => {
                                if (provider.configured === false) {
                                    results.push({ provider: provider.id, status: "not_configured", threats: [], operation: "lookup" });
                                    return;
                                }
                                try {
                                    throwIfAborted(totalSignal);
                                    evidence.privacy.remoteAnalysisUsed = true;
                                    evidence.privacy.fullUrlShared ||= provider.fullUrlRequired === true;
                                    const url = new URL(provider.fullUrlRequired ? local.normalizedUrl : redactUrl(local.normalizedUrl));
                                    results.push({ ...validateReputation(await withBudget((stageSignal) => provider.lookup(url, { signal: stageSignal }), budgets.reputation, totalSignal)), provider: provider.id });
                                }
                                catch {
                                    results.push({ provider: provider.id, status: "unavailable", threats: [], operation: "lookup" });
                                }
                            }));
                            const configured = results.filter((result) => result.status !== "not_configured");
                            const available = configured.filter((result) => result.status !== "unavailable");
                            evidence.reputation = { status: !configured.length ? "not_configured" : !available.length ? "unavailable" : available.length < configured.length ? "partial" : "complete", results };
                            if (!available.length || available.length < configured.length)
                                evidence.partial = true;
                        };
                        const remote = async () => {
                            if (mode === "reputation-only")
                                return;
                            try {
                                evidence.privacy.remoteAnalysisUsed = true;
                                evidence.remote = await withBudget((stageSignal) => fetcher.inspect(local.normalizedUrl, { signal: stageSignal }), budgets.remote, totalSignal);
                                evidence.privacy.fullUrlShared ||= evidence.remote.requestMade !== false;
                            }
                            catch {
                                evidence.privacy.fullUrlShared = true;
                                evidence.remote = { status: "unavailable", reason: "remote_inspection_unavailable_or_timeout", redirectChain: [], bytesRead: 0 };
                            }
                            if (evidence.remote.status !== "complete")
                                evidence.partial = true;
                        };
                        await Promise.all([reputation(), remote()]);
                        throwIfAborted(totalSignal);
                        if (mode !== "ai-assisted")
                            return;
                        if (!config.llmProvider) {
                            evidence.aiStatus = "not_configured";
                            evidence.partial = true;
                            return;
                        }
                        const page = evidence.remote?.page;
                        const { visibleTextSample = "", ...metadata } = page ?? {};
                        const aiEvidence = {
                            urlFeatures: { url: redactUrl(local.normalizedUrl), asciiHostname: local.asciiHostname, unicodeHostname: local.unicodeHostname, signals: local.signals },
                            reputationSignals: evidence.reputation?.results ?? [],
                            remotePageMetadata: page ? metadata : undefined,
                            visibleTextExcerpt: sanitizeText(visibleTextSample),
                        };
                        // Also remove exact decoded query values if a page echoes them outside URLs.
                        const secrets = [...original.searchParams.values()].filter(Boolean);
                        const scrub = (value) => {
                            if (typeof value === "string")
                                return secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), sanitizeText(value)).slice(0, 20_000);
                            if (Array.isArray(value))
                                return value.map(scrub);
                            if (value && typeof value === "object")
                                return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
                            return value;
                        };
                        try {
                            evidence.privacy.remoteAnalysisUsed = true;
                            evidence.privacy.pageContentSharedWithLlm = !!page;
                            const result = await withBudget((stageSignal) => config.llmProvider.analyze(scrub(aiEvidence), { signal: stageSignal }), budgets.ai, totalSignal);
                            const { provider, model, latencyMs, ...payload } = result;
                            const validated = validateAi(payload);
                            if (provider !== undefined && (typeof provider !== "string" || provider.length > 128) || model !== undefined && (typeof model !== "string" || model.length > 128) || latencyMs !== undefined && (!Number.isFinite(latencyMs) || latencyMs < 0))
                                throw new Error("ai_invalid_metadata");
                            evidence.ai = { ...validated, reasons: validated.reasons.map((reason) => sanitizeText(reason, 512)), provider, model, latencyMs };
                            evidence.aiStatus = "complete";
                        }
                        catch {
                            evidence.aiStatus = "unavailable";
                            evidence.partial = true;
                        }
                    }, budgets.total, signal);
                }
                catch {
                    throwIfAborted(signal);
                    evidence.partial = true;
                }
                throwIfAborted(signal);
                if (mode === "ai-assisted" && !evidence.aiStatus) {
                    evidence.aiStatus = "unavailable";
                    evidence.partial = true;
                }
                if (evidence.reputation)
                    evidence.reputation = { ...evidence.reputation, results: [...evidence.reputation.results].sort((a, b) => a.provider.localeCompare(b.provider)) };
                return engine.aggregate(local, evidence);
            }, options.signal);
        },
    };
}
//# sourceMappingURL=analyzer.js.map