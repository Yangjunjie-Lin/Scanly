import type { DecodeCandidate, ScanEvidence } from "./types.js";

export function geometryEvidence(candidate: DecodeCandidate): number {
  const points = candidate.geometry;
  if (!points || points.length < 3 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]; area += points[index].x * next.y - next.x * points[index].y;
  }
  const magnitude = Math.abs(area) / 2;
  return magnitude > 16 ? 1 : magnitude > 4 ? 0.6 : 0.25;
}

export function buildScanEvidence(
  candidates: readonly DecodeCandidate[],
  temporalObservations = 1,
): ScanEvidence {
  const primary = candidates[0];
  const routes = [...new Set(candidates.map((candidate) => candidate.route))];
  const decoderValidation = candidates.some((candidate) => candidate.validation.decoderValidation);
  const checksumValues = candidates.map((candidate) => candidate.validation.checksumValidated).filter((value): value is boolean => value !== undefined);
  const checksumValidated = checksumValues.length ? checksumValues.every(Boolean) : undefined;
  const errorCorrectionEvidence = Math.max(0, ...candidates.map((candidate) => candidate.validation.errorCorrectionEvidence ?? 0));
  const geometryQuality = Math.max(0, ...candidates.map(geometryEvidence));
  const boundedTemporal = Math.max(0, Math.min(5, Math.floor(temporalObservations)));
  let evidenceScore = 0;
  if (decoderValidation) evidenceScore += 30;
  if (checksumValidated === true) evidenceScore += 20;
  evidenceScore += Math.min(10, errorCorrectionEvidence * 10);
  evidenceScore += Math.min(10, boundedTemporal * 2);
  evidenceScore += Math.min(15, routes.length * 5);
  evidenceScore += geometryQuality * 15;
  return {
    decoderValidation,
    ...(checksumValidated === undefined ? {} : { checksumValidated }),
    ...(errorCorrectionEvidence <= 0 ? {} : { errorCorrectionEvidence }),
    temporalObservations: boundedTemporal,
    independentRouteAgreement: routes.length,
    geometryQuality,
    recoveryRoutesUsed: routes,
    evidenceScore: Math.round(Math.max(0, Math.min(100, evidenceScore))),
  };
}

export function decodeCandidateFromResult(result: import("../contracts/result.js").ScanResult, route: DecodeCandidate["route"], elapsedMs: number): DecodeCandidate {
  const validatorIds = result.validation.validatorIds.map((id) => id.toLowerCase());
  const checksumValidator = validatorIds.some((id) => id.includes("checksum") || id.includes("ean") || id.includes("upc"));
  const correction = result.metadata?.errorCorrectionEvidence;
  return {
    payload: result.rawText,
    format: result.format,
    engine: result.engine.id,
    route,
    ...(result.cornerPoints ? { geometry: result.cornerPoints } : {}),
    validation: {
      decoderValidation: result.validation.valid,
      ...(checksumValidator ? { checksumValidated: result.validation.valid } : {}),
      formatStructuralValidity: result.validation.valid,
      ...(typeof correction === "number" && Number.isFinite(correction) ? { errorCorrectionEvidence: Math.max(0, Math.min(1, correction)) } : {}),
    },
    result,
    elapsedMs,
  };
}
