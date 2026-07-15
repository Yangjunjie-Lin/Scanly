import { describe, expect, it } from "vitest";
import { BUILTIN_SCENARIOS, getBuiltinScenario, validateScenario } from "@scanly/scenario-schema";

describe("scenario schema v2", () => {
  it.each(Object.keys(BUILTIN_SCENARIOS) as Array<keyof typeof BUILTIN_SCENARIOS>)("validates the %s built-in", (id) => {
    expect(validateScenario(getBuiltinScenario(id))).toEqual({ ok: true, value: getBuiltinScenario(id) });
  });

  it("keeps fast, balanced, and robust budgets materially distinct", () => {
    const fast = getBuiltinScenario("fast");
    const balanced = getBuiltinScenario("balanced");
    const robust = getBuiltinScenario("robust");
    expect(fast.budgets.maxAttempts).toBeLessThan(balanced.budgets.maxAttempts);
    expect(balanced.budgets.maxAttempts).toBeLessThan(robust.budgets.maxAttempts);
    expect(fast.multiCode.enabled).toBe(false);
    expect(robust.localization.maxCandidates).toBeGreaterThan(balanced.localization.maxCandidates);
  });

  it("returns paths and human-readable messages for malformed scenarios", () => {
    const malformed = { ...getBuiltinScenario("balanced"), schemaVersion: "1.0", id: "Bad Id", budgets: { ...getBuiltinScenario("balanced").budgets, maxAttempts: 0 } };
    const result = validateScenario(malformed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["schemaVersion", "id", "budgets.maxAttempts"]));
      expect(result.message).toContain("schemaVersion");
    }
  });

  it("rejects invalid relative ROI coordinates", () => {
    const scenario = getBuiltinScenario("balanced");
    scenario.input.roi = { mode: "relative", x: -0.1, y: 0, width: 1.2, height: 0 };
    const result = validateScenario(scenario);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.filter((issue) => issue.path.startsWith("input.roi"))).toHaveLength(3);
  });
});
