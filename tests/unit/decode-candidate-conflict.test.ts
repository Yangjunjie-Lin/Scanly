import { describe, expect, it } from "vitest";
import { DecodeCandidateResolver, type DecodeCandidate, type RecoveryRouteId, type ScanResult } from "@scanly/core";

function candidate(payload: string, route: RecoveryRouteId, options: { checksum?: boolean; x?: number; format?: ScanResult["format"] } = {}): DecodeCandidate {
  const x = options.x ?? 0;
  const result: ScanResult = {
    format: options.format ?? "qr_code", rawText: payload, cornerPoints: [{ x, y: 0 }, { x: x + 20, y: 0 }, { x: x + 20, y: 20 }, { x, y: 20 }],
    engine: { id: "fake", version: "1" }, preprocessingPath: [], frameId: "f", structuredPayload: null,
    validation: { valid: true, validatorIds: [], messages: [] }, warnings: [], timing: { totalMs: 1 },
  };
  return { payload, format: result.format, engine: "fake", route, geometry: result.cornerPoints, validation: { decoderValidation: true, formatStructuralValidity: true, ...(options.checksum === undefined ? {} : { checksumValidated: options.checksum }) }, result, elapsedMs: 1 };
}

describe("DecodeCandidateResolver", () => {
  it("confirms cross-route agreement", () => {
    const set = new DecodeCandidateResolver().resolve([candidate("A", "general"), candidate("A", "low-contrast"), candidate("A", "perspective")]);
    expect(set.confirmed?.payload).toBe("A");
    expect(set.conflicts).toHaveLength(0);
  });

  it("does not silently choose conflicting payloads", () => {
    const set = new DecodeCandidateResolver().resolve([candidate("A", "low-contrast"), candidate("B", "perspective")]);
    expect(set.confirmed).toBeUndefined();
    expect(set.conflicts).toHaveLength(1);
  });

  it("accepts a decisive checksum-valid candidate over checksum-invalid evidence", () => {
    const set = new DecodeCandidateResolver().resolve([candidate("A", "low-contrast", { checksum: true }), candidate("B", "perspective", { checksum: false })]);
    expect(set.confirmed?.payload).toBe("A");
  });

  it("keeps non-overlapping physical symbols as separate confirmed candidates", () => {
    const set = new DecodeCandidateResolver().resolve([candidate("A", "general", { x: 0 }), candidate("B", "general", { x: 100 })]);
    expect(set.confirmedCandidates.map((entry) => entry.payload)).toEqual(["A", "B"]);
  });

  it("requires independent or temporal evidence for recovered Code 128", () => {
    const one = new DecodeCandidateResolver().resolve([candidate("A", "quiet-zone", { format: "code_128" })]);
    expect(one.confirmed).toBeUndefined();
    expect(one.rejectedCount).toBe(1);
    const agreed = new DecodeCandidateResolver().resolve([candidate("A", "blur", { format: "code_128" }), candidate("A", "small-module", { format: "code_128" })]);
    expect(agreed.confirmed?.payload).toBe("A");
    const temporal = new DecodeCandidateResolver().resolve([candidate("A", "blur", { format: "code_128" })], { temporalObservations: 2 });
    expect(temporal.confirmed?.payload).toBe("A");
  });
});
