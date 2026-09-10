/// <reference path="./punycode.d.ts" />
import punycode from "punycode/punycode.js";
export const MAX_URL_LENGTH = 16_384;
export function normalizeUrl(input) {
    if (typeof input !== "string" || input.length > MAX_URL_LENGTH)
        throw new Error("url_invalid_or_too_long");
    let url;
    try {
        url = new URL(input);
    }
    catch {
        throw new Error("url_invalid");
    }
    if (!["http:", "https:"].includes(url.protocol))
        throw new Error("url_scheme_blocked");
    url.hash = "";
    // WHATWG serialization is deterministic. Preserve ordering and duplicate keys:
    // sorting query parameters can change signed URLs and server semantics.
    return { normalizedUrl: url.href, asciiHostname: url.hostname, unicodeHostname: punycode.toUnicode(url.hostname) };
}
export function redactUrl(input) {
    try {
        const url = new URL(input);
        url.username = "";
        url.password = "";
        url.hash = "";
        const keys = [...url.searchParams.keys()];
        url.search = "";
        for (const key of keys)
            url.searchParams.append(key, "[REDACTED]");
        return url.href;
    }
    catch {
        return "[INVALID_URL]";
    }
}
/** Extra defense for free text; HTML/LLM evidence is never logged. */
export function sanitizeText(input, limit = 20_000) {
    return input.slice(0, limit)
        .replace(/https?:\/\/[^\s<>"']+/gi, (url) => redactUrl(url))
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
        .replace(/\b(token|password|secret|session|code|authorization)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
        .replace(/[A-Za-z0-9+/=_-]{80,}/g, "[REDACTED_BLOB]");
}
export function structuredUrl(payload) {
    if (payload?.kind !== "url" && payload?.kind !== "gs1-digital-link")
        return null;
    if (typeof payload.fields.href !== "string")
        return null;
    try {
        return normalizeUrl(payload.fields.href).normalizedUrl;
    }
    catch {
        return null;
    }
}
export function validateMode(mode) {
    if (mode === undefined)
        return "local-only";
    if (mode === "local-only" || mode === "reputation-only" || mode === "remote" || mode === "ai-assisted")
        return mode;
    throw new Error("url_safety_invalid_mode");
}
function entropy(value) {
    const counts = new Map();
    for (const char of value)
        counts.set(char, (counts.get(char) ?? 0) + 1);
    return [...counts.values()].reduce((sum, count) => { const p = count / value.length; return sum - p * Math.log2(p); }, 0);
}
const brands = {
    paypal: ["paypal.com"], microsoft: ["microsoft.com", "live.com", "office.com"],
    apple: ["apple.com", "icloud.com"], google: ["google.com"], amazon: ["amazon.com", "amazon.co.uk"],
};
export class LocalUrlAnalyzer {
    analyze(input) {
        const normalized = normalizeUrl(input);
        const url = new URL(normalized.normalizedUrl);
        const host = url.hostname.replace(/\.$/, "");
        const labels = host.split(".");
        const signals = [];
        const add = (id, severity, description, evidence = host) => signals.push({ id, severity, description, evidence });
        if (url.protocol === "http:")
            add("cleartext_http", "low", "HTTP does not encrypt the connection.");
        const ipLiteral = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[");
        if (ipLiteral)
            add("ip_literal", "medium", "URL uses an IP address instead of a domain.");
        const privateLike = host === "localhost" || !host.includes(".") || /\.(localhost|local|internal|lan|home|test|invalid)$/.test(host) || /^(127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || /^\[(::|f[cd]|fe[89ab])/i.test(host);
        if (privateLike)
            add("private_network_target", "high", "Local or private-network-like target; remote inspection is blocked.");
        if (url.port && url.port !== "80" && url.port !== "443")
            add("nonstandard_port", "medium", "Nonstandard port; default remote policy blocks this port.");
        if (url.username || url.password)
            add("embedded_credentials", "high", "URL contains embedded credentials.");
        if (input.length > 2_048)
            add("long_url", "low", "Unusually long URL.", `length=${input.length}`);
        if (labels.length > 5)
            add("excessive_subdomains", "low", "Unusually many hostname labels.");
        if (host.includes("xn--"))
            add("punycode", "low", "Internationalized hostname; verify its spelling.");
        if (/[^\x00-\x7f]/.test(normalized.unicodeHostname))
            add("unicode_hostname", "low", "Unicode characters can resemble other characters.");
        if (/[a-z]/i.test(normalized.unicodeHostname) && /[\u0400-\u052f\u0370-\u03ff]/.test(normalized.unicodeHostname))
            add("mixed_script_hostname", "medium", "Mixed Latin and Cyrillic/Greek hostname characters.");
        if (entropy(labels.slice(0, -1).join("")) > 4.2)
            add("hostname_entropy", "low", "Hostname has high character diversity.");
        if (labels.slice(0, -2).some((label) => label.length > 24 && entropy(label) > 3.7))
            add("random_subdomain", "low", "Long random-looking subdomain.");
        if (/\.(zip|mov|top|click|work)$/.test(host))
            add("tld_signal", "low", "Top-level domain is a weak contextual signal, not proof of abuse.");
        if (["bit.ly", "t.co", "tinyurl.com", "is.gd", "ow.ly", "shorturl.at"].includes(host))
            add("url_shortener", "low", "Shortened URL hides the destination until inspected.");
        for (const [brand, domains] of Object.entries(brands)) {
            if (host.includes(brand) && !domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
                add("brand_domain_mismatch", "medium", "Hostname resembles a known brand outside its configured domains.", brand);
                if (labels.slice(0, -2).some((label) => label.includes(brand)))
                    add("brand_subdomain", "low", "Brand name appears in a subdomain controlled by another domain.", brand);
            }
        }
        const entries = [...url.searchParams];
        if (entries.filter(([key]) => /redirect|return|next|continue|url|target|dest/i.test(key)).length > 1)
            add("redirect_parameters", "low", "Multiple redirect-looking query parameters.");
        if (entries.some(([, value]) => /https?:\/\//i.test(value)))
            add("nested_url", "low", "Query contains another URL.");
        if (entries.some(([, value]) => /^[A-Za-z0-9+/_-]{32,}={0,2}$/.test(value)))
            add("encoded_query", "low", "Query has encoded or opaque values.");
        let pathname = url.pathname;
        try {
            pathname = decodeURIComponent(pathname);
        }
        catch { /* preserve malformed escapes */ }
        if (/\.(exe|msi|apk|dmg|zip|scr|bat|cmd|ps1|docm|xlsm)(?:$|\/)/i.test(pathname))
            add("download_extension", "medium", "Path points to a potentially executable or packaged download.");
        if (/login|signin|verify|account|secure|wallet|payment|password|authentication|oauth/i.test(pathname))
            add("credential_path", "low", "Path references credentials or account/payment actions.");
        return { ...normalized, signals, remoteAllowed: !privateLike && !url.username && !url.password && (!url.port || url.port === "80" || url.port === "443") };
    }
}
//# sourceMappingURL=local.js.map