import { describe, expect, it } from "vitest";
import { buildScanEvidence, type DecodeCandidate, type ScanResult } from "@scanly/core";

function candidate(route: DecodeCandidate["route"], checksumValidated?: boolean): DecodeCandidate {
  const result: ScanResult = {
    format: "qr_code", rawText: "EVIDENCE", cornerPoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
    engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId: "f", structuredPayload: null,
    validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 },
  };
  return { payload: result.rawText, format: result.format, engine: "fake", route, geometry: result.cornerPoints, validation: { decoderValidation: true, formatStructuralValidity: true, ...(checksumValidated === undefined ? {} : { checksumValidated }) }, result, elapsedMs: 1 };
}

describe("ScanEvidence", () => {
  it("increases with independent route agreement without claiming probability", () => {
    const one = buildScanEvidence([candidate("general")]);
    const three = buildScanEvidence([candidate("general"), candidate("low-contrast"), candidate("perspective")]);
    expect(three.independentRouteAgreement).toBe(3);
    expect(three.evidenceScore).toBeGreaterThan(one.evidenceScore);
    expect(three.evidenceScore).toBeLessThanOrEqual(100);
    expect("probability" in three).toBe(false);
  });
});
