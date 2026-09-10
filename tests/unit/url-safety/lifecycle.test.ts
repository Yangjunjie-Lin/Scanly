import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSemanticPayload } from "@scanly/parsers";
import { ScannerSession } from "@scanly/browser";
import { LocalUrlAnalyzer, UrlRiskEngine, UrlSafetyCache, UrlSafetyClient, UrlSafetyController, urlSafetyCacheKey, type UrlSafetyAnalysis, type UrlSafetyState } from "@scanly/url-safety";
import { createUrlSafetyAnalyzer, createUrlSafetyHandler } from "@scanly/url-safety/server";
import { readJsonBounded, validateAnalysis } from "../../../packages/url-safety/src/validation";
import type { NormalizedFrame, ScanOutcome, ScanResult } from "@scanly/core";

const result = (url = "https://example.com/") => new UrlRiskEngine().aggregate(new LocalUrlAnalyzer().analyze(url));
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
afterEach(() => { vi.unstubAllGlobals(); });

describe("cache and scanner ownership", () => {
  it("hashes normalized URL, dedupes 100 concurrent and sequential calls within TTL", async () => {
    const inspect = vi.fn(async () => ({ status: "complete" as const, bytesRead: 0, redirectChain: [] }));
    const analyzer = createUrlSafetyAnalyzer({ remoteFetcher: { inspect } });
    const values = await Promise.all(Array.from({ length: 100 }, () => analyzer.analyze("https://example.com", { mode: "remote" })));
    expect(inspect).toHaveBeenCalledTimes(1);
    values[0].riskScore = 99; expect(values[1].riskScore).toBe(0);
    await analyzer.analyze("https://example.com", { mode: "remote" }); expect(inspect).toHaveBeenCalledTimes(1);
    expect(await urlSafetyCacheKey("HTTPS://EXAMPLE.com:443#fragment")).toBe(await urlSafetyCacheKey("https://example.com/"));
    expect(await urlSafetyCacheKey("https://example.com?a=1")).not.toBe(await urlSafetyCacheKey("https://example.com?a=2"));
  });
  it("expires TTL and separates mode scopes", async () => {
    const cache = new UrlSafetyCache({ ttlMs: 10, maxEntries: 1 }); const work = vi.fn(async () => result());
    await cache.run("https://example.com", "local-only", work); await tick(); await new Promise((resolve) => setTimeout(resolve, 15));
    await cache.run("https://example.com", "local-only", work); expect(work).toHaveBeenCalledTimes(2);
    await cache.run("https://example.com", "remote", work); expect(work).toHaveBeenCalledTimes(3);
    expect(() => new UrlSafetyCache({ ttlMs: 0 })).toThrow();
  });
  it("one subscriber cancellation cannot abort another; last subscriber cancels shared work", async () => {
    const cache = new UrlSafetyCache(); let release!: (value: UrlSafetyAnalysis) => void; let signal!: AbortSignal;
    const work = vi.fn((ownedSignal: AbortSignal) => { signal = ownedSignal; return new Promise<UrlSafetyAnalysis>((resolve) => { release = resolve; }); });
    const first = new AbortController(); const second = new AbortController();
    const a = cache.run("https://example.com", "remote", work, first.signal); const b = cache.run("https://example.com", "remote", work, second.signal);
    const rejected = expect(a).rejects.toMatchObject({ name: "AbortError" }); await tick(); first.abort(); await rejected;
    expect(signal.aborted).toBe(false); release(result()); await b;
    const last = new AbortController(); const c = cache.run("https://other.com", "remote", work, last.signal); const lastRejected = expect(c).rejects.toMatchObject({ name: "AbortError" });
    await tick(); last.abort(); await lastRejected; expect(signal.aborted).toBe(true); cache.clear();
  });
  it("bounds in-flight entries and can recover from failed work", async () => {
    const cache = new UrlSafetyCache({ maxEntries: 1 }); const controller = new AbortController();
    const pending = cache.run("https://one.com", "local-only", () => new Promise(() => {}), controller.signal);
    const cancelled = expect(pending).rejects.toThrow(); await tick();
    await expect(cache.run("https://two.com", "local-only", async () => result())).rejects.toThrow("url_safety_cache_busy"); controller.abort(); await cancelled;
    await expect(cache.run("https://one.com", "local-only", async () => { throw new Error("SECRET"); })).rejects.toThrow("url_safety_analysis_failed");
    expect((await cache.run("https://one.com", "local-only", async () => result())).riskScore).toBe(0);
  });
  it("defaults disabled, ignores raw detection and non-URLs, and starts after result publication", async () => {
    const analyze = vi.fn(async () => result()); const states: UrlSafetyState[] = [];
    const safety = new UrlSafetyController({ analyze }, (state) => states.push(state));
    safety.acceptEvent({ type: "emitted", barcode: { text: "https://example.com" } }); expect(analyze).not.toHaveBeenCalled();
    safety.configure("remote");
    for (const text of ["text", "WIFI:T:WPA;S:home;P:secret;;", "BEGIN:VCARD\nFN:Name\nEND:VCARD"]) safety.acceptEvent({ type: "emitted", barcode: { text } });
    for (const type of ["detected", "suppressed", "lost"]) safety.acceptEvent({ type, barcode: { text: "https://example.com" } });
    await tick(); expect(analyze).not.toHaveBeenCalled();
    for (let i = 0; i < 100; i++) safety.acceptEvent({ type: "emitted", barcode: { text: "https://example.com" } });
    expect(analyze).not.toHaveBeenCalled(); await tick(); expect(analyze).toHaveBeenCalledTimes(1); expect(states.at(-1)?.status).toBe("complete"); safety.dispose();
  });
  it("cancels A and suppresses its late result after B", async () => {
    const releases: Array<(value: UrlSafetyAnalysis) => void> = []; const signals: AbortSignal[] = []; const states: UrlSafetyState[] = [];
    const safety = new UrlSafetyController({ analyze: async (_url, options) => { signals.push(options!.signal!); return new Promise((resolve) => releases.push(resolve)); } }, (state) => states.push(state));
    safety.configure("remote"); safety.accept(parseSemanticPayload("https://a.com").structured); await tick();
    safety.accept(parseSemanticPayload("https://b.com").structured); await tick(); expect(signals[0].aborted).toBe(true);
    releases[1](result("https://b.com")); await tick(); releases[0](result("https://a.com")); await tick();
    expect(states.at(-1)?.analysis?.url).toBe("https://b.com/"); safety.dispose(); expect(signals[1].aborted).toBe(true);
    safety.acceptEvent({ type: "emitted", barcode: { text: "https://c.com" } }); expect(signals).toHaveLength(2);
  });
  it("isolates failures and consumer callback errors from decoding", async () => {
    const states: UrlSafetyState[] = []; const safety = new UrlSafetyController({ analyze: async () => { throw new Error("provider failed"); } }, (state) => { states.push(state); throw new Error("consumer"); });
    safety.configure("remote"); safety.accept(parseSemanticPayload("https://example.com").structured); await tick(); expect(states.at(-1)?.status).toBe("failed"); safety.dispose();
  });
  it("attaches to a real ScannerSession without blocking results and drains on stop/dispose", async () => {
    let onFrame!: (frame: NormalizedFrame) => void | Promise<void>;
    const source = { start: async (callback: typeof onFrame) => { onFrame = callback; }, stop: vi.fn() };
    const decoded: ScanResult = { format: "qr_code", rawText: "https://example.com", engine: { id: "fake", version: "1" }, frameId: "one", structuredPayload: parseSemanticPayload("https://example.com").structured, preprocessingPath: [], validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 } };
    const decoder = { decode: async (): Promise<ScanOutcome> => ({ ok: true, primary: decoded, results: [decoded], frameId: "one", scenarioId: "test", attemptCount: 1, timing: { totalMs: 1 } }), cancel() {}, dispose() {} };
    const session = new ScannerSession({ source, decoder, confirmation: { mode: "immediate" }, quality: { blurThreshold: 0, contrastThreshold: 0, underexposedThreshold: 0, overexposedThreshold: 1, glareThreshold: 1 } });
    let signal: AbortSignal | undefined; const analyze = vi.fn(async (_url: string, options?: { signal?: AbortSignal }) => { signal = options?.signal; return new Promise<UrlSafetyAnalysis>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("cancelled")))); });
    const safety = new UrlSafetyController({ analyze }, () => {}); safety.configure("remote"); safety.attach(session);
    const emitted = vi.fn(); session.onResult(emitted); await session.start();
    await onFrame({ id: "one", timestampMs: 1, width: 4, height: 4, rowStride: 16, pixelFormat: "rgba8888", orientation: 0, sourceType: "camera", ownership: "owned", data: new Uint8ClampedArray(64).fill(100) });
    await tick(); expect(emitted).toHaveBeenCalledTimes(1); expect(analyze).toHaveBeenCalledTimes(1);
    await session.stop(); expect(signal?.aborted).toBe(true); await session.dispose(); safety.dispose();
  });
});

describe("browser/backend request boundary", () => {
  const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://scanly.example/api/url-safety", { method: "POST", headers: { origin: "https://scanly.example", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  it("browser local-only sends zero network; remote sends only URL and mode to same-origin endpoint", async () => {
    const fetchMock = vi.fn(async () => Response.json(result())); vi.stubGlobal("fetch", fetchMock);
    const client = new UrlSafetyClient({ endpoint: "/api/url-safety" });
    await client.analyze("https://example.com"); expect(fetchMock).not.toHaveBeenCalled();
    await client.analyze("https://example.com#FRAGMENT", { mode: "remote" });
    expect(fetchMock).toHaveBeenCalledWith("/api/url-safety", expect.objectContaining({ credentials: "omit", redirect: "error", method: "POST", body: JSON.stringify({ url: "https://example.com/", mode: "remote" }) })); client.dispose();
    for (const endpoint of ["https://attacker.com", "//attacker.com", "/\\attacker.com"]) expect(() => new UrlSafetyClient({ endpoint })).toThrow();
  });
  it("fails closed on malformed/oversized/error client response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ riskLevel: "safe" })).mockResolvedValueOnce(new Response("error", { status: 429 })).mockResolvedValueOnce(Response.json({ blob: "x".repeat(150_000) })));
    const client = new UrlSafetyClient({ endpoint: "/api/url-safety" });
    for (const url of ["https://a.com", "https://b.com", "https://c.com"]) await expect(client.analyze(url, { mode: "remote" })).rejects.toThrow();
    expect(() => validateAnalysis({})).toThrow(); await expect(readJsonBounded(new Response(null))).rejects.toThrow();
  });
  it("enforces origin, method, JSON schema and both declared/streamed request size", async () => {
    const analyze = vi.fn(async () => result()); const handler = createUrlSafetyHandler({ analyzer: { analyze } });
    expect((await handler(new Request("https://scanly.example/api/url-safety"))).status).toBe(405);
    expect((await handler(request({}, { origin: "https://evil.com" }))).status).toBe(403);
    expect((await handler(request({}, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await handler(request({}, { "content-length": "999999" }))).status).toBe(413);
    for (const body of [null, [], { url: "javascript:x" }, { url: "https://example.com", mode: "invalid" }, { url: "https://example.com", image: "pixels" }, { url: "x".repeat(25_000) }]) expect((await handler(request(body))).status).toBe(400);
    expect((await handler(request({ url: "https://example.com", mode: "remote" }))).status).toBe(403);
    expect(analyze).not.toHaveBeenCalled();
    const response = await handler(request({ url: "https://example.com" })); expect(response.status).toBe(200); expect(response.headers.has("access-control-allow-origin")).toBe(false); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rate limits without trusting forged forwarded IP headers", async () => {
    const handler = createUrlSafetyHandler({ analyzer: { analyze: async () => result() }, requestsPerMinute: 1 });
    expect((await handler(request({ url: "https://example.com" }))).status).toBe(200);
    const response = await handler(request({ url: "https://example.com" }, { "x-forwarded-for": "8.8.8.8" })); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
  });
  it("bounds concurrency/timeout, propagates cancellation and does not expose errors", async () => {
    let signal!: AbortSignal;
    const handler = createUrlSafetyHandler({ analyzer: { analyze: async (_url, options) => { signal = options!.signal!; return new Promise(() => {}); } }, maxConcurrent: 1, timeoutMs: 20 });
    const pending = handler(request({ url: "https://example.com" })); await tick();
    expect((await handler(request({ url: "https://example.com" }))).status).toBe(429);
    expect((await pending).status).toBe(504); expect(signal.aborted).toBe(true);
    const controller = new AbortController(); controller.abort();
    const aborted = new Request("https://scanly.example/api/url-safety", { method: "POST", headers: { origin: "https://scanly.example", "content-type": "application/json" }, body: "{}", signal: controller.signal });
    expect((await handler(aborted)).status).toBe(499);
  });
});
