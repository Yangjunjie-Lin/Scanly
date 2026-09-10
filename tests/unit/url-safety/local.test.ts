import { describe, expect, it } from "vitest";
import { parseSemanticPayload } from "@scanly/parsers";
import { LocalUrlAnalyzer, normalizeUrl, redactUrl, structuredUrl, UrlRiskEngine } from "@scanly/url-safety";
import { sanitizeText, validateMode } from "../../../packages/url-safety/src/local";
import type { AiRiskAnalysis, RemoteInspectionResult } from "@scanly/url-safety";

const local = new LocalUrlAnalyzer();
describe("URL canonicalization and local-only evidence", () => {
  it("uses WHATWG normalization, preserving path/query semantics", () => {
    expect(normalizeUrl("HTTPS://EXAMPLE.COM:443/a/%2f?b=2&a=1&a=3#secret").normalizedUrl).toBe("https://example.com/a/%2f?b=2&a=1&a=3");
    expect(normalizeUrl("http://EXAMPLE.com:80").normalizedUrl).toBe("http://example.com/");
  });
  it("keeps Unicode and ASCII hostnames", () => {
    const value = normalizeUrl("https://bücher.example/路径");
    expect(value.asciiHostname).toBe("xn--bcher-kva.example"); expect(value.unicodeHostname).toBe("bücher.example");
    expect(normalizeUrl(value.normalizedUrl)).toEqual(value);
  });
  it.each(["invalid", "javascript:alert(1)", "data:text/plain,hello", "file:///etc/passwd", "ftp://example.com", "https://example.com/" + "a".repeat(16_384)])("rejects unsupported/invalid input %s", (url) => { expect(() => normalizeUrl(url)).toThrow(); });
  it.each([
    ["http://example.com", "cleartext_http"], ["https://8.8.8.8", "ip_literal"], ["https://localhost", "private_network_target"],
    ["https://test.internal", "private_network_target"], ["https://192.168.1.2", "private_network_target"], ["https://example.com:8443", "nonstandard_port"],
    ["https://user:pass@example.com", "embedded_credentials"], ["https://example.com/" + "a".repeat(2_100), "long_url"],
    ["https://a.b.c.d.e.example.com", "excessive_subdomains"], ["https://xn--bcher-kva.example", "punycode"], ["https://раypal.example", "mixed_script_hostname"],
    ["https://abcdefghijklmnopqrstuvwxy12345.example.com", "random_subdomain"], ["https://abcde12345xyzpq98765.example.com", "hostname_entropy"],
    ["https://example.zip", "tld_signal"], ["https://bit.ly/x", "url_shortener"], ["https://paypal.attacker.com", "brand_subdomain"],
    ["https://paypal-payments.com/login", "brand_domain_mismatch"], ["https://example.com/?next=x&redirect=y", "redirect_parameters"],
    ["https://example.com/?next=https%3A%2F%2Fother.com", "nested_url"], ["https://example.com/?token=" + "abcd".repeat(10), "encoded_query"],
    ["https://example.com/file.apk", "download_extension"], ["https://example.com/%6cogin", "credential_path"],
  ])("emits a signal for %s", (url, id) => { expect(local.analyze(url).signals.map((signal) => signal.id)).toContain(id); });
  it("does not treat lexical signals as proof of maliciousness", () => {
    expect(local.analyze("https://accounts.paypal.com/login").signals.map((s) => s.id)).not.toContain("brand_domain_mismatch");
    expect(new UrlRiskEngine().aggregate(local.analyze("https://example.zip")).riskLevel).toBe("low");
    expect(local.analyze("https://example.com/%zz").signals).toEqual([]);
  });
  it("does not mistake a public IPv6 literal for an unqualified private hostname", () => {
    const result = local.analyze("https://[2606:4700:4700::1111]/");
    expect(result.remoteAllowed).toBe(true);
    expect(result.signals.map((signal) => signal.id)).toEqual(["ip_literal"]);
  });
  it("redacts all query values, userinfo, fragment and free-text secrets", () => {
    const url = redactUrl("https://alice:password@example.com/path?token=secret&email=x&token=other#frag");
    expect(url).not.toMatch(/alice|password|secret|other|frag/); expect(new URL(url).searchParams.getAll("token")).toEqual(["[REDACTED]", "[REDACTED]"]);
    expect(redactUrl("garbage")).toBe("[INVALID_URL]");
    expect(sanitizeText("email=x@example.com token=SECRET " + "a".repeat(100))).not.toContain("SECRET");
    expect(JSON.stringify(local.analyze("https://example.com?token=SECRET").signals)).not.toContain("SECRET");
  });
  it.each(["plain text", "WIFI:T:WPA;S:home;P:secret;;", "BEGIN:VCARD\nFN:Person\nEND:VCARD", "mailto:x@example.com"]) ("does not route non-URL payload %s", (value) => { expect(structuredUrl(parseSemanticPayload(value).structured)).toBeNull(); });
  it("routes existing URL and GS1 parser output only", () => {
    for (const url of ["https://example.com", "https://id.gs1.org/01/123"]) expect(structuredUrl(parseSemanticPayload(url).structured)).toBe(new URL(url).href);
    expect(structuredUrl({ kind: "url", parserVersion: "1.0", fields: { href: 3 }, warnings: [] })).toBeNull();
    expect(structuredUrl({ kind: "url", parserVersion: "1.0", fields: { href: "javascript:x" }, warnings: [] })).toBeNull();
    expect(validateMode(undefined)).toBe("local-only"); expect(() => validateMode("all")).toThrow();
  });
});

const benign: AiRiskAnalysis = { classification: "benign", riskContribution: 0, confidence: "high", reasons: ["No evidence of phishing."] };
const remote: RemoteInspectionResult = { status: "complete", redirectChain: [], bytesRead: 20, page: { title: "Page", description: "", visibleTextSample: "", formCount: 0, passwordInput: false, externalFormActions: [], iframeCount: 0, scriptSourceDomains: [], linkTargetDomains: [] } };
describe("deterministic evidence authority", () => {
  const engine = new UrlRiskEngine(); const normal = local.analyze("https://example.com");
  it.each([["MALWARE", "critical"], ["SOCIAL_ENGINEERING", "critical"], ["UNWANTED_SOFTWARE", "high"]] as const)("keeps %s above a benign LLM", (threat, level) => {
    expect(engine.aggregate(normal, { reputation: { status: "complete", results: [{ provider: "web-risk", status: "match", threats: [threat], operation: "lookup" }] }, ai: benign }).riskLevel).toBe(level);
  });
  it("never upgrades no-match or benign AI to safe", () => {
    expect(engine.aggregate(normal, { reputation: { status: "complete", results: [{ provider: "p", status: "no_match", threats: [], operation: "lookup" }] }, ai: benign, remote }).riskLevel).toBe("low");
    expect(engine.aggregate(normal).riskLevel).toBe("unknown");
    expect(engine.aggregate(normal, { partial: true }).status).toBe("partial");
  });
  it("combines local mismatch, credential form and advisory phishing", () => {
    const result = engine.aggregate(local.analyze("https://paypal.attacker.com/login"), { remote: { ...remote, page: { ...remote.page!, passwordInput: true, externalFormActions: ["evil.com"] } }, ai: { ...benign, classification: "phishing", riskContribution: 20 } });
    expect(result.riskScore).toBeGreaterThanOrEqual(40); expect(result.recommendations).toContain("do_not_enter_credentials");
  });
  it("bounds LLM even if invoked directly with invalid scores", () => {
    expect(engine.aggregate(normal, { ai: { ...benign, riskContribution: 500 } }).riskScore).toBe(20);
    expect(engine.aggregate(normal, { ai: { ...benign, riskContribution: NaN } }).riskScore).toBe(0);
  });
});
