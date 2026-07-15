/** Deduplicate decoded results by payload (first occurrence wins). */
export function dedupeResults(results) {
    const seen = new Set();
    const out = [];
    for (const r of results) {
        const key = r.payload;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(r);
    }
    return out;
}
/** True if string looks like http(s) URL. */
export function looksLikeUrl(s) {
    try {
        const u = new URL(s);
        return u.protocol === "http:" || u.protocol === "https:";
    }
    catch {
        return false;
    }
}
/** Normalize whitespace-only payloads to empty failure candidates. */
export function normalizePayload(payload) {
    return payload.replace(/\u0000/g, "").trimEnd();
}
//# sourceMappingURL=result-normalizer.js.map