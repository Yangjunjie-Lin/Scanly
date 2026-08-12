import {
  RecoveryMemoryAccountant,
  type BarcodeDifficultyDiagnosis,
  type NormalizedFrame,
  type RecoveryContext,
} from "@scanly/core";
import { createRgbaFrame } from "@scanly/core";

export function syntheticFrame(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number | readonly [number, number, number],
  id = "industrial-test-frame",
): NormalizedFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = pixel(x, y);
    const [red, green, blue] = typeof value === "number" ? [value, value, value] : value;
    const index = (y * width + x) * 4;
    data[index] = red; data[index + 1] = green; data[index + 2] = blue; data[index + 3] = 255;
  }
  return createRgbaFrame(data, width, height, { id, ownership: "owned", sourceType: "pixel-buffer" });
}

export function recoveryContext(
  frame: NormalizedFrame,
  diagnosis: Partial<BarcodeDifficultyDiagnosis> = {},
  options: Partial<Pick<RecoveryContext, "profile" | "sourceMode" | "dpmExperimentalEnabled">> = {},
): RecoveryContext {
  const base: BarcodeDifficultyDiagnosis = {
    blur: "none", motionBlur: "none", underexposure: "none", overexposure: "none", glare: "none", lowContrast: "none",
    perspectiveDistortion: "none", curvature: "none", smallModule: "none", printingDamage: "none", occlusion: "none",
    recommendedRoutes: [], evidence: {},
  };
  return {
    diagnosis: { ...base, ...diagnosis, evidence: { ...base.evidence, ...diagnosis.evidence } },
    profile: options.profile ?? "industrial", sourceMode: options.sourceMode ?? "static",
    budget: {
      maximumRoutes: 8, maximumAttempts: 12, maximumPixelsProcessed: frame.width * frame.height * 16,
      maximumCandidates: 3, maximumRectifiedArea: frame.width * frame.height * 4,
      maximumPerspectiveTransforms: 2, maximumTemporaryBytes: 64 * 1024 * 1024, maximumTotalMs: 1_000,
    },
    framePixels: frame.width * frame.height,
    memory: new RecoveryMemoryAccountant(64 * 1024 * 1024), candidateRegions: [],
    startedAt: 0, now: () => 1, dpmExperimentalEnabled: options.dpmExperimentalEnabled ?? false,
  };
}

export function releaseCandidates(candidates: readonly { dispose(): void }[]): void { for (const candidate of candidates) candidate.dispose(); }
