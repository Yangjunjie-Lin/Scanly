import { describe, expect, it } from "vitest";
import { evaluateFixture } from "../../lib/benchmark/fixture-contract";
import type { BenchmarkFixture } from "../../lib/qr/benchmark-types";

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

  it("uses an exact single-code payload contract", () => {
    const single = fixture({ category: "text", expectedPayload: "EXACT" });
    expect(evaluateFixture(single, ["EXACT"], true).pass).toBe(true);
    expect(evaluateFixture(single, ["WRONG", "EXACT"], true).pass).toBe(false);
  });
});
