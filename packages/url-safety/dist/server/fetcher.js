import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { boundedNumber, throwIfAborted, withBudget } from "../async.js";
import { normalizeUrl, redactUrl, sanitizeText } from "../local.js";
import { extractPageMetadata } from "./html.js";
import { RemotePolicyError, resolvePublicTarget } from "./ip-policy.js";
function pinnedGet(url, address, maxBytes, signal) {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        const request = (url.protocol === "https:" ? httpsRequest : httpRequest)({
            protocol: url.protocol, hostname: address, port: url.port || undefined,
            // A validated numeric destination is used directly. No second DNS lookup,
            // pooled socket, proxy env, cookie jar, or automatic redirect is possible.
            agent: false, method: "GET", path: `${url.pathname}${url.search}`, signal,
            servername: isIP(hostname) ? "" : hostname, rejectUnauthorized: true,
            maxHeaderSize: 16_384,
            headers: { Host: url.host, Accept: "text/html, text/plain, application/xhtml+xml", "Accept-Encoding": "identity", "User-Agent": "Scanly-UrlSafety/2.1" },
        }, (response) => {
            const statusCode = response.statusCode ?? 0;
            const contentType = (response.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
            const result = { statusCode, contentType, location: response.headers.location, body: "", bytesRead: 0 };
            if ([301, 302, 303, 307, 308].includes(statusCode) || !["text/html", "text/plain", "application/xhtml+xml"].includes(contentType)) {
                response.destroy();
                resolve(result);
                return;
            }
            if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
                response.destroy();
                reject(new RemotePolicyError("remote_inspection_encoding_blocked"));
                return;
            }
            if (Number(response.headers["content-length"]) > maxBytes) {
                response.destroy();
                reject(new RemotePolicyError("remote_inspection_body_limit"));
                return;
            }
            const chunks = [];
            response.on("data", (chunk) => {
                result.bytesRead += chunk.length;
                if (result.bytesRead > maxBytes) {
                    response.destroy();
                    request.destroy();
                    reject(new RemotePolicyError("remote_inspection_body_limit"));
                }
                else
                    chunks.push(chunk);
            });
            response.on("end", () => { result.body = Buffer.concat(chunks).toString("utf8"); resolve(result); });
            response.on("error", reject);
            response.on("aborted", () => reject(new Error("remote_inspection_response_aborted")));
        });
        request.on("error", reject);
        request.end();
    });
}
export class SafeRemoteFetcher {
    timeoutMs;
    maxBytes;
    constructor(options = {}) {
        this.timeoutMs = boundedNumber(options.timeoutMs, 5_000, 8_000);
        this.maxBytes = boundedNumber(options.maxBytes, 512 * 1024, 1024 * 1024);
    }
    async inspect(input, options = {}) {
        const redirectChain = [];
        let requestMade = false;
        throwIfAborted(options.signal);
        let normalized;
        try {
            normalized = normalizeUrl(input).normalizedUrl;
        }
        catch {
            return { status: "blocked", reason: "remote_inspection_url_blocked", redirectChain, bytesRead: 0, requestMade };
        }
        try {
            return await withBudget(async (signal) => {
                let url = new URL(normalized);
                for (let hop = 0; hop <= 3; hop++) {
                    const address = await resolvePublicTarget(url);
                    throwIfAborted(signal);
                    redirectChain.push(redactUrl(url.href));
                    requestMade = true;
                    const response = await pinnedGet(url, address, this.maxBytes, signal);
                    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                        if (hop === 3)
                            throw new RemotePolicyError("remote_inspection_redirect_limit");
                        if (!response.location)
                            throw new RemotePolicyError("remote_inspection_redirect_missing_location");
                        url = new URL(response.location, url);
                        url.hash = "";
                        if (url.href.length > 16_384)
                            throw new RemotePolicyError("remote_inspection_redirect_url_limit");
                        continue;
                    }
                    const result = { status: "complete", finalUrl: redactUrl(url.href), redirectChain, statusCode: response.statusCode, contentType: response.contentType, bytesRead: response.bytesRead, requestMade };
                    if (response.contentType === "text/html" || response.contentType === "application/xhtml+xml")
                        result.page = extractPageMetadata(response.body, url.href);
                    if (response.contentType === "text/plain")
                        result.page = { title: "", description: "", visibleTextSample: [...url.searchParams.values()].filter(Boolean).reduce((text, secret) => text.split(secret).join("[REDACTED]"), sanitizeText(response.body)).slice(0, 20_000), formCount: 0, passwordInput: false, externalFormActions: [], iframeCount: 0, scriptSourceDomains: [], linkTargetDomains: [] };
                    return result;
                }
                throw new Error("remote_inspection_incomplete");
            }, this.timeoutMs, options.signal);
        }
        catch (error) {
            throwIfAborted(options.signal);
            return { status: error instanceof RemotePolicyError ? "blocked" : "unavailable", reason: error instanceof RemotePolicyError ? error.message : "remote_inspection_unavailable_or_timeout", redirectChain, bytesRead: 0, requestMade };
        }
    }
}
//# sourceMappingURL=fetcher.js.map