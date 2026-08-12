import { describe, expect, it } from "vitest";
import { ScannerDiagnostics, type ScannerRecoveryDiagnosticSnapshot, type ScanResult } from "@scanly/core";

describe("ScannerDiagnostics", () => {
  it("explains route entry, rejection safety, and success without pixels or payload copies", () => {
    const snapshot: ScannerRecoveryDiagnosticSnapshot = {
      difficulty: { blur: "none", motionBlur: "none", underexposure: "none", overexposure: "none", glare: "none", lowContrast: "high", perspectiveDistortion: "none", curvature: "none", smallModule: "none", printingDamage: "none", occlusion: "none", recommendedRoutes: ["low-contrast"], evidence: { contrast: 0.02 } },
      routesAttempted: ["low-contrast"], routeSucceeded: "low-contrast", attemptCount: 1, processedPixels: 100,
      candidateConflictCount: 0, insufficientEvidence: false, reasons: [],
    };
    const result = { metadata: { scannerDiagnostics: snapshot } } as unknown as ScanResult;
    expect(ScannerDiagnostics.fromResult(result)).toEqual(snapshot);
    expect(ScannerDiagnostics.explain(snapshot).join(" ")).toContain("low-contrast");
    expect(JSON.stringify(snapshot)).not.toContain("rawText");
  });
});
