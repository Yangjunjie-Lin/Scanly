import { describe, expect, it } from "vitest";
import { isSafeActionUrl, parseSemanticPayload } from "@scanly/parsers";

describe("semantic parsers", () => {
  it.each([
    ["https://example.com/a?b=1", "url"],
    ["WIFI:T:WPA;S:Scanly\\;Lab;P:secret;;", "wifi"],
    ["BEGIN:VCARD\nVERSION:3.0\nFN:Ada Lovelace\nEND:VCARD", "vcard"],
    ["mailto:test@example.com?subject=Hello", "email"],
    ["tel:+441234567890", "telephone"],
    ["sms:+44123?body=Hello", "sms"],
    ["geo:53.4808,-2.2426", "geo"],
    ["BEGIN:VEVENT\nSUMMARY:Review\nEND:VEVENT", "calendar"],
    ["(01)09506000134352(17)270101", "gs1-element-string"],
    ["https://id.gs1.org/01/09506000134352", "gs1-digital-link"],
  ])("parses %s without replacing raw text", (rawText, kind) => {
    const parsed = parseSemanticPayload(rawText);
    expect(parsed.rawText).toBe(rawText);
    expect(parsed.structured?.kind).toBe(kind);
  });

  it("permits explicit actions only for HTTP and HTTPS URLs", () => {
    expect(isSafeActionUrl("https://example.com")).toBe(true);
    expect(isSafeActionUrl("http://example.com")).toBe(true);
    expect(isSafeActionUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeActionUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeActionUrl("file:///etc/passwd")).toBe(false);
  });
});
