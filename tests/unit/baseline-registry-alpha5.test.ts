import { describe, expect, it } from "vitest";
import {
  isValidBaselineId,
} from "../../scripts/symbology-gates.js";

/**
 * Alpha.5 baseline registry naming stays version-independent: Alpha.4 r4 remains
 * valid alongside Alpha.5 / Beta / RC / GA revision IDs. Mixed-revision gate-mode
 * selection is covered in benchmark-gate-mode.test.ts.
 */
describe("Alpha.5 baseline ID registry naming", () => {
  it("keeps Alpha.4 r4 naming valid", () => {
    expect(isValidBaselineId("v2-alpha4-r4")).toBe(true);
  });

  it("accepts Alpha.5 r1", () => {
    expect(isValidBaselineId("v2-alpha5-r1")).toBe(true);
  });

  it("accepts future Beta / RC / GA naming", () => {
    expect(isValidBaselineId("v2-beta1-r1")).toBe(true);
    expect(isValidBaselineId("v2-beta2-r3")).toBe(true);
    expect(isValidBaselineId("v2-rc1-r1")).toBe(true);
    expect(isValidBaselineId("v2-r1")).toBe(true);
  });

  it("rejects IDs without a revision suffix", () => {
    expect(isValidBaselineId("v2-alpha5")).toBe(false);
    expect(isValidBaselineId("v2-beta1")).toBe(false);
  });
});
