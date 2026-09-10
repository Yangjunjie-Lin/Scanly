import { abortError, boundedNumber, throwIfAborted } from "./async.js";
import { normalizeUrl } from "./local.js";
export async function urlSafetyCacheKey(url) {
    const bytes = new TextEncoder().encode(normalizeUrl(url).normalizedUrl);
    return [...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export class UrlSafetyCache {
    entries = new Map();
    ttlMs;
    maxEntries;
    constructor(options = {}) {
        this.ttlMs = boundedNumber(options.ttlMs, 15 * 60_000, 24 * 60 * 60_000);
        this.maxEntries = boundedNumber(options.maxEntries, 256, 10_000);
    }
    async run(url, mode, work, signal) {
        throwIfAborted(signal);
        const key = `${mode}:${await urlSafetyCacheKey(url)}`;
        throwIfAborted(signal);
        for (const [id, cached] of this.entries)
            if (cached.settled && cached.expires <= Date.now())
                this.entries.delete(id);
        let entry = this.entries.get(key);
        if (!entry) {
            if (this.entries.size >= this.maxEntries) {
                const oldest = [...this.entries].find(([, value]) => value.settled);
                if (!oldest)
                    throw new Error("url_safety_cache_busy");
                this.entries.delete(oldest[0]);
            }
            const controller = new AbortController();
            entry = { controller, subscribers: new Set(), expires: Infinity, settled: false, promise: Promise.resolve().then(() => { throwIfAborted(controller.signal); return work(controller.signal); }) };
            this.entries.set(key, entry);
            const created = entry;
            void created.promise.then((result) => {
                created.settled = true;
                created.expires = Date.now() + (result.status === "complete" ? this.ttlMs : Math.min(this.ttlMs, 5_000));
            }, () => { if (this.entries.get(key) === created)
                this.entries.delete(key); });
        }
        const owned = entry;
        const owner = Symbol();
        owned.subscribers.add(owner);
        return new Promise((resolve, reject) => {
            const release = () => {
                signal?.removeEventListener("abort", cancel);
                owned.subscribers.delete(owner);
            };
            const cancel = () => {
                release();
                if (!owned.settled && owned.subscribers.size === 0) {
                    owned.controller.abort();
                    if (this.entries.get(key) === owned)
                        this.entries.delete(key);
                }
                reject(abortError());
            };
            signal?.addEventListener("abort", cancel, { once: true });
            owned.promise.then((result) => { release(); resolve(structuredClone(result)); }, () => { release(); reject(owned.controller.signal.aborted ? abortError() : new Error("url_safety_analysis_failed")); });
        });
    }
    clear() { for (const entry of this.entries.values())
        entry.controller.abort(); this.entries.clear(); }
}
//# sourceMappingURL=cache.js.map