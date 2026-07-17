import { describe, expect, it } from "vitest";
import { BUILTIN_SCENARIOS, getBuiltinScenario, migrateScenario, validateScenario } from "@scanly/scenario-schema";

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
    if (!result.ok) expect(result.issues.filter((issue) => issue.path.startsWith("input.roi")).length).toBeGreaterThanOrEqual(3);
  });

  it("accepts portable plugin engine ids and rejects unknown/contradictory fields", () => {
    const plugin = getBuiltinScenario("fast");
    plugin.decoders.order = ["vendor.datamatrix-wasm"];
    expect(validateScenario(plugin).ok).toBe(true);

    const invalid = getBuiltinScenario("fast") as unknown as Record<string, unknown>;
    invalid.silentFutureFlag = true;
    const result = validateScenario(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain("silentFutureFlag");
  });

  it("rejects candidate/result budgets that would otherwise silently clamp fields", () => {
    const value = getBuiltinScenario("fast");
    value.localization.maxCandidates = value.budgets.maxCandidates + 1;
    value.multiCode.maxResults = value.budgets.maxAttempts + 1;
    const result = validateScenario(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(["localization.maxCandidates", "multiCode.maxResults"]));
  });

  it("migrates schema 2.0 fallback naming and rejects ambiguous mixed input", () => {
    const legacy = getBuiltinScenario("balanced") as unknown as Record<string, unknown>;
    legacy.schemaVersion = "2.0";
    const ablation = legacy.ablation as Record<string, unknown>;
    ablation.zxingFallback = ablation.multiEngineFallback;
    delete ablation.multiEngineFallback;
    const migrated = migrateScenario(legacy);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.value.schemaVersion).toBe("2.1");
      expect(migrated.value.ablation.multiEngineFallback).toBe(true);
    }
    ablation.multiEngineFallback = true;
    expect(migrateScenario(legacy).ok).toBe(false);
  });
});
