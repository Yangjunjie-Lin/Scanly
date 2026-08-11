import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyIndustrialCorpus } from "../../scripts/verify-industrial-corpus.js";

describe("industrial benchmark contract", () => {
  it("records recall slices, marginal route attribution, ablation, budgets, and zero-FP gates", () => {
    const source = fs.readFileSync("scripts/benchmark-industrial.ts", "utf8");
    expect(verifyIndustrialCorpus()).toMatchObject({ generated: 42, negative: 120 });
    for (const contract of ["byDifficulty", "bySeverity", "byFormat", "routeAttribution", "routeClassification", "ablation", "falsePositivesZero", "defaultRoutesHavePositiveAblationContribution", "maximumProcessedPixels"]) expect(source).toContain(contract);
    expect(source).toContain("neuralSuperResolution: false");
    expect(source).toContain("generativeRecovery: false");
  });

  it("defines a 5000-frame industrial cleanup soak", () => {
    const source = fs.readFileSync("scripts/soak-industrial.ts", "utf8");
    expect(source).toContain("5_000");
    for (const final of ["finalTemporaryBuffers: 0", "finalRouteState: 0", "finalNativeResultCount: 0", "finalPendingScannerFrames: 0", "finalControlledMemory: 0"]) expect(source).toContain(final);
  });
});
