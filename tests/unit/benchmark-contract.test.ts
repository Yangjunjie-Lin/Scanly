import { describe, expect, it } from "vitest";
import { evaluateFixture, requiredPayloads, requiredPayloadsForProfile, type BenchmarkFixture } from "@scanly/benchmark";

function fixture(overrides: Partial<BenchmarkFixture> = {}): BenchmarkFixture {
  return {
    id: "fixture",
    file: "fixtures/example.png",
    category: "multiple",
    expectedPayload: "PRIMARY",
    expectedOutcome: "decode",
    sourceType: "generated",
    license: "project-generated",
    ...overrides,
  };
}

describe("benchmark fixture contract", () => {
  it("requires the complete multiple payload set", () => {
    const multiple = fixture({ requiredPayloads: ["PRIMARY", "SECONDARY"] });
    expect(evaluateFixture(multiple, ["PRIMARY"], true)).toEqual({
      pass: false,
      missingPayloads: ["SECONDARY"],
      unexpectedPayloads: [],
    });
    expect(evaluateFixture(multiple, ["SECONDARY", "PRIMARY"], true).pass).toBe(true);
  });

  it("rejects extras when allowExtraPayloads is false", () => {
    const strict = fixture({
      requiredPayloads: ["PRIMARY", "SECONDARY"],
      allowExtraPayloads: false,
    });
    const result = evaluateFixture(strict, ["PRIMARY", "SECONDARY", "EXTRA"], true);
    expect(result.pass).toBe(false);
    expect(result.unexpectedPayloads).toEqual(["EXTRA"]);
  });

  it("uses only an explicitly declared profile-specific completeness contract", () => {
    const payloads = Array.from({ length: 12 }, (_, index) => `CODE-${index + 1}`);
    const multiple = fixture({ requiredPayloads: payloads, profileExpectedResultCount: { balanced: 8, robust: 12 } });
    expect(requiredPayloadsForProfile(multiple, "balanced")).toEqual(payloads.slice(0, 8));
    expect(requiredPayloadsForProfile(multiple, "robust")).toEqual(payloads);
    expect(requiredPayloadsForProfile(multiple, "fast")).toEqual(payloads);
    expect(() => requiredPayloadsForProfile({ ...multiple, profileExpectedResultCount: { balanced: 13 } }, "balanced")).toThrow(/invalid balanced/);
  });

  it("uses an exact single-code payload contract", () => {
    const single = fixture({ category: "text", expectedPayload: "EXACT" });
    expect(evaluateFixture(single, ["EXACT"], true).pass).toBe(true);
    expect(evaluateFixture(single, ["WRONG", "EXACT"], true).pass).toBe(false);
  });

  it("accepts only an explicit no-symbol result for a normal negative", () => {
    const negative = fixture({ category: "negative", expectedPayload: "", expectedOutcome: "no-symbol" });
    expect(evaluateFixture(negative, [], { ok: false, errorCode: "no_symbol_found" }).pass).toBe(true);
    expect(evaluateFixture(negative, [], { ok: false, errorCode: "timeout" }).pass).toBe(false);
    expect(evaluateFixture(negative, [], { ok: false, errorCode: "engine_execution_failure" }).pass).toBe(false);
  });

  it("requires an explicitly allowed malformed-input code and ignores empty payload requirements", () => {
    const malformed = fixture({ category: "negative", expectedPayload: "", expectedOutcome: "invalid-input", allowedFailureCodes: ["invalid_image"] });
    expect(evaluateFixture(malformed, [], { ok: false, errorCode: "invalid_image" }).pass).toBe(true);
    expect(evaluateFixture(malformed, [], { ok: false, errorCode: "no_symbol_found" }).pass).toBe(false);
    expect(requiredPayloads(malformed)).toEqual([]);
  });
});
