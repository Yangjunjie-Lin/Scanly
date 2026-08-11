import { describe, expect, it } from "vitest";
import {
  RecoveryMemoryAccountant,
  RecoveryPlanner,
  RecoveryRouteRegistry,
  recoveryBudgetFor,
  type BarcodeDifficultyDiagnosis,
  type RecoveryContext,
  type RecoveryRoute,
  type RecoveryRouteId,
} from "@scanly/core";

function diagnosis(routes: RecoveryRouteId[]): BarcodeDifficultyDiagnosis {
  return {
    blur: "none", motionBlur: "none", underexposure: "none", overexposure: "none", glare: "none", lowContrast: "high",
    perspectiveDistortion: "medium", curvature: "none", smallModule: "none", printingDamage: "none", occlusion: "none",
    recommendedRoutes: routes, evidence: {},
  };
}

function route(id: RecoveryRouteId, cost: number): RecoveryRoute {
  return { id, supports: () => true, estimateCost: () => cost, run: async () => [] };
}

function context(registry: RecoveryRouteRegistry, routes: RecoveryRouteId[]): RecoveryContext {
  void registry;
  return {
    diagnosis: diagnosis(routes), profile: "balanced", sourceMode: "camera",
    budget: { maximumRoutes: 2, maximumAttempts: 3, maximumPixelsProcessed: 180 },
    framePixels: 100,
    memory: new RecoveryMemoryAccountant(1_024), candidateRegions: [], startedAt: 0, now: () => 0,
    dpmExperimentalEnabled: false,
  };
}

describe("RecoveryPlanner", () => {
  it("selects diagnosis routes within route and pixel budgets", () => {
    const registry = new RecoveryRouteRegistry();
    registry.register(route("low-contrast", 80)); registry.register(route("perspective", 90)); registry.register(route("dpm", 10));
    const plan = new RecoveryPlanner(registry).plan(context(registry, ["perspective", "low-contrast", "dpm"]));
    expect(plan.entries.map((entry) => entry.routeId)).toEqual(["low-contrast", "perspective"]);
    expect(plan.rejected).toContainEqual({ routeId: "dpm", reason: "maximum-routes" });
  });

  it("keeps DPM off unless explicitly enabled", () => {
    const registry = new RecoveryRouteRegistry(); registry.register(route("dpm", 10));
    const plan = new RecoveryPlanner(registry).plan(context(registry, ["dpm"]));
    expect(plan.entries).toHaveLength(0);
    expect(plan.rejected[0]?.reason).toBe("dpm-experimental-disabled");
  });

  it("defines camera budgets below static industrial budgets", () => {
    const camera = recoveryBudgetFor("fast", "camera", 1_000);
    const industrial = recoveryBudgetFor("industrial", "static", 1_000);
    expect(camera.maximumRoutes).toBeLessThan(industrial.maximumRoutes);
    expect(camera.maximumAttempts).toBeLessThan(industrial.maximumAttempts);
    expect(camera.maximumPixelsProcessed).toBeLessThan(industrial.maximumPixelsProcessed);
  });

  it("rejects duplicate route registrations", () => {
    const registry = new RecoveryRouteRegistry(); registry.register(route("blur", 10));
    expect(() => registry.register(route("blur", 10))).toThrow(/already registered/);
  });
});
