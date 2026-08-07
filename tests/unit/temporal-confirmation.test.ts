import { describe, expect, it } from "vitest";
import { TemporalCandidateStore } from "../../packages/browser/src/scanner/temporal-confirmation";
describe("TemporalCandidateStore contract", () => it("keeps candidates bounded", () => { const store = new TemporalCandidateStore({ maximumCandidates: 1, mode: "immediate" }); const barcode = { text: "x", format: "qr_code" as const, formatClass: "matrix" as const, engineId: "jsqr" }; const quality = { blurScore: 1, brightness: .5, contrast: 1, glareRatio: 0, edgeDensity: 1, underexposed: false, overexposed: false, blurred: false, glareDominated: false, usable: true }; store.observe(barcode, undefined, quality, 0); expect(store.size).toBe(1); }));
it("adapts to one trusted high-quality observation but requires two edge observations", () => {
  const quality = { blurScore: 1, brightness: .5, contrast: 1, glareRatio: 0, edgeDensity: 1, underexposed: false, overexposed: false, blurred: false, glareDominated: false, usable: true };
  const trusted = { text: "trusted", format: "qr_code" as const, formatClass: "matrix" as const, engineId: "jsqr" };
  const edge = { ...trusted, text: "edge", engineId: "zxing-js" };
  const store = new TemporalCandidateStore({ mode: "adaptive" });
  expect(store.observe(trusted, undefined, quality, 0).newlyConfirmed).toBe(true);
  expect(store.observe(edge, undefined, quality, 0).newlyConfirmed).toBe(false);
  expect(store.observe(edge, undefined, quality, 100).newlyConfirmed).toBe(true);
});
