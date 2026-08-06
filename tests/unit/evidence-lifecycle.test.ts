import { describe, expect, it } from "vitest";
import {
  assertEvidenceLifecycleTransition,
  benchmarkLifecycleState,
  canTransitionEvidenceLifecycle,
  selectEvidenceLifecycle,
} from "../../scripts/evidence-lifecycle.js";

describe("evidence lifecycle", () => {
  it("keeps historical Alpha.4 evidence in source-development for Alpha.5 source", () => {
    expect(selectEvidenceLifecycle({
      sdkVersion: "2.0.0-alpha.5",
      canonical: { sdkVersion: "2.0.0-alpha.4", evidenceId: "alpha4", manifestHash: "a", sourceCompatible: false },
    })).toBe("source-development");
  });

  it("selects evidence-bootstrap for matching source without active registry evidence", () => {
    expect(selectEvidenceLifecycle({
      sdkVersion: "2.0.0-alpha.5",
      canonical: { sdkVersion: "2.0.0-alpha.5", evidenceId: "alpha5", manifestHash: "a", sourceCompatible: true },
    })).toBe("evidence-bootstrap");
  });

  it("selects active-baseline only when the active registry claims the canonical evidence", () => {
    expect(selectEvidenceLifecycle({
      sdkVersion: "2.0.0-alpha.5",
      canonical: { sdkVersion: "2.0.0-alpha.5", evidenceId: "alpha5", manifestHash: "a", sourceCompatible: true },
      activeEvidence: { evidenceId: "alpha5", canonicalManifestHash: "a" },
    })).toBe("active-baseline");
  });

  it("allows a stale active claim to reach strict verification", () => {
    expect(selectEvidenceLifecycle({
      sdkVersion: "2.0.0-alpha.5",
      canonical: { sdkVersion: "2.0.0-alpha.5", evidenceId: "alpha5", manifestHash: "new", sourceCompatible: false },
      activeEvidence: { evidenceId: "alpha5", canonicalManifestHash: "old" },
    })).toBe("active-baseline");
  });

  it("models the complete lifecycle and benchmark mode", () => {
    expect(canTransitionEvidenceLifecycle("source-development", "baseline-candidate")).toBe(true);
    expect(canTransitionEvidenceLifecycle("source-development", "active-baseline")).toBe(false);
    expect(benchmarkLifecycleState("source-development")).toBe("baseline-candidate");
    expect(benchmarkLifecycleState("release")).toBe("active-baseline");
    expect(() => assertEvidenceLifecycleTransition("source-development", "release")).toThrow(/Invalid evidence lifecycle transition/);
  });
});
