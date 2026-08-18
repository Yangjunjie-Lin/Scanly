import { describe, expect, it } from "vitest";
import { escapeCsvField, toCsvRow } from "@scanly/benchmark";

describe("CSV escaping", () => {
  it("leaves simple fields unquoted", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
  });

  it("quotes fields with commas", () => {
    expect(escapeCsvField("a,b")).toBe('"a,b"');
  });

  it("escapes internal quotes", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("handles Wi-Fi payload with commas (requires quoting)", () => {
    const wifi = 'WIFI:T:WPA;S:ScanlyLab;P:test,pass-01;;';
    const row = toCsvRow(["wifi-01", wifi]);
    expect(row).toContain('"WIFI:T:WPA;S:ScanlyLab;P:test,pass-01;;"');
  });

  it("handles newlines in payload", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });
});
