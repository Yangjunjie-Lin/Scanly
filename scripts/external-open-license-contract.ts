import path from "node:path";
import { normalizeRetailBarcode } from "@scanly/core";
import type { BarcodeFormat } from "@scanly/scenario-schema";

export const EXTERNAL_PROVENANCE_NOTE = "Third-party open-license real-world photograph; not project-owned.";

export interface ExternalRequiredResult {
  format: BarcodeFormat;
  payload: string;
  isGs1?: boolean;
}

export interface ExternalPhysicalInstance extends ExternalRequiredResult {
  isGs1: boolean;
  count: number;
}

export interface ExternalResultDiff {
  missing: ExternalRequiredResult[];
  unexpected: ExternalRequiredResult[];
}

export interface ExternalFixture {
  id: string;
  file: string;
  format: BarcodeFormat;
  formatClass: "matrix" | "stacked" | "linear";
  sourceType: "external-open-license";
  sourceRepository: "Wikimedia Commons";
  sourcePage: string;
  originalFilename: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  retrievedAt: string;
  modifications: unknown[];
  expectedOutcome: "decode";
  expectedResultCount: number;
  requiredResults: ExternalRequiredResult[];
  physicalInstanceCount: number;
  physicalInstances: ExternalPhysicalInstance[];
  semanticResultPolicy: "unique-format-payload-gs1";
  orientation: number;
  difficultyTags: string[];
  expectedGs1?: boolean;
  expectedFormat: BarcodeFormat;
  expectedPayload: string | null;
  payloadVerificationStatus: "verified" | "unknown" | "sensitive";
  publicRepositorySafe: boolean;
  provenanceNote: string;
  sha256: string;
  visualVerificationStatus: "verified";
}

export function validateExternalFixtureSet(fixtures: readonly ExternalFixture[]): void {
  for (const field of ["id", "file", "sourcePage", "sha256"] as const) {
    const seen = new Set<string>();
    for (const fixture of fixtures) {
      const value = fixture[field];
      if (seen.has(value)) throw new Error(`${fixture.id}: duplicate external fixture ${field}: ${value}`);
      seen.add(value);
    }
  }
}

export function externalFixtureDirectory(format: BarcodeFormat): string {
  if (format === "data_matrix") return "data-matrix";
  if (format === "pdf417") return "pdf417";
  if (format === "code_128") return "code128";
  if (["ean_13", "ean_8", "upc_a", "upc_e"].includes(format)) return "retail";
  throw new Error(`External Alpha.5 fixture format is unsupported: ${format}`);
}

function externalFormatClass(format: BarcodeFormat): ExternalFixture["formatClass"] {
  if (format === "data_matrix") return "matrix";
  if (format === "pdf417") return "stacked";
  if (["code_128", "ean_13", "ean_8", "upc_a", "upc_e"].includes(format)) return "linear";
  throw new Error(`External Alpha.5 fixture format is unsupported: ${format}`);
}

function resultKey(result: ExternalRequiredResult): string {
  return JSON.stringify([result.format, result.payload, result.isGs1 ?? false]);
}

export function externalPayloadsEquivalent(left: ExternalRequiredResult, right: ExternalRequiredResult): boolean {
  if (left.payload === right.payload) return true;
  const leftRetail = normalizeRetailBarcode(left.format, left.payload)?.normalizedGtin14;
  const rightRetail = normalizeRetailBarcode(right.format, right.payload)?.normalizedGtin14;
  return typeof leftRetail === "string" && leftRetail === rightRetail;
}

export function isExternalFormatMisclassification(
  required: readonly ExternalRequiredResult[],
  actual: ExternalRequiredResult,
): boolean {
  return required.some((expected) => expected.format !== actual.format && externalPayloadsEquivalent(expected, actual));
}

export function isExternalGs1Misclassification(
  required: readonly ExternalRequiredResult[],
  actual: ExternalRequiredResult,
): boolean {
  return required.some((expected) => (
    expected.format === actual.format
    && expected.payload === actual.payload
    && (expected.isGs1 ?? false) !== (actual.isGs1 ?? false)
  ));
}

function resultMultiset(results: readonly ExternalRequiredResult[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const result of results) {
    const key = resultKey(result);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Compares decoded results to independent manifest ground truth. Order is not
 * significant, but multiplicity is: neither missing nor additional results
 * are accepted.
 */
export function exactExternalResultMultiset(
  required: readonly ExternalRequiredResult[],
  actual: readonly ExternalRequiredResult[],
): boolean {
  const diff = diffExternalResultMultiset(required, actual);
  return diff.missing.length === 0 && diff.unexpected.length === 0;
}

/** Returns the multiplicity-sensitive missing and unexpected decode results. */
export function diffExternalResultMultiset(
  required: readonly ExternalRequiredResult[],
  actual: readonly ExternalRequiredResult[],
): ExternalResultDiff {
  const remainingRequired = resultMultiset(required);
  const unexpected: ExternalRequiredResult[] = [];
  for (const result of actual) {
    const key = resultKey(result);
    const count = remainingRequired.get(key) ?? 0;
    if (count === 0) {
      unexpected.push(result);
      continue;
    }
    if (count === 1) remainingRequired.delete(key);
    else remainingRequired.set(key, count - 1);
  }
  const missing: ExternalRequiredResult[] = [];
  for (const result of required) {
    const key = resultKey(result);
    const count = remainingRequired.get(key) ?? 0;
    if (count === 0) continue;
    missing.push(result);
    if (count === 1) remainingRequired.delete(key);
    else remainingRequired.set(key, count - 1);
  }
  return { missing, unexpected };
}

export function validateExternalFixture(fixture: ExternalFixture): void {
  const requiredMetadata = [
    fixture.id,
    fixture.file,
    fixture.sourcePage,
    fixture.originalFilename,
    fixture.author,
    fixture.license,
    fixture.licenseUrl,
    fixture.attribution,
    fixture.retrievedAt,
    fixture.sha256,
  ];
  if (requiredMetadata.some((value) => typeof value !== "string" || value.length === 0)) {
    throw new Error(`${fixture.id || "external fixture"}: incomplete metadata`);
  }
  if (fixture.sourceType !== "external-open-license" || fixture.sourceRepository !== "Wikimedia Commons") {
    throw new Error(`${fixture.id}: invalid source classification`);
  }
  if (!fixture.sourcePage.startsWith("https://commons.wikimedia.org/wiki/File:")) {
    throw new Error(`${fixture.id}: sourcePage must be a Wikimedia Commons file page`);
  }
  if (!/^https:\/\//.test(fixture.licenseUrl)) throw new Error(`${fixture.id}: licenseUrl must be HTTPS`);
  if (!/^[a-f0-9]{64}$/.test(fixture.sha256)) throw new Error(`${fixture.id}: sha256 must be lowercase hexadecimal`);
  if (!Number.isFinite(Date.parse(fixture.retrievedAt))) throw new Error(`${fixture.id}: retrievedAt must be an ISO-8601 timestamp`);
  if (fixture.provenanceNote !== EXTERNAL_PROVENANCE_NOTE) throw new Error(`${fixture.id}: invalid provenance note`);
  if (fixture.visualVerificationStatus !== "verified") throw new Error(`${fixture.id}: visual verification is not recorded`);
  if (fixture.publicRepositorySafe !== true || fixture.payloadVerificationStatus === "sensitive") {
    throw new Error(`${fixture.id}: unsafe or sensitive fixture cannot be accepted`);
  }
  if (fixture.payloadVerificationStatus !== "verified") {
    throw new Error(`${fixture.id}: exact external Ground Truth requires a verified payload; unknown payloads must not be guessed or admitted`);
  }
  if (typeof fixture.expectedPayload !== "string") {
    throw new Error(`${fixture.id}: verified payload is missing`);
  }
  if (!Array.isArray(fixture.modifications) || fixture.modifications.length !== 0) {
    throw new Error(`${fixture.id}: originals must have an empty modifications array; put transformations under derived/`);
  }

  if (fixture.expectedOutcome !== "decode") throw new Error(`${fixture.id}: external photograph expectedOutcome must be decode`);
  if (!Array.isArray(fixture.requiredResults) || fixture.requiredResults.length === 0) {
    throw new Error(`${fixture.id}: requiredResults must contain independent ground truth`);
  }
  if (!Number.isInteger(fixture.expectedResultCount) || fixture.expectedResultCount !== fixture.requiredResults.length) {
    throw new Error(`${fixture.id}: expectedResultCount must equal requiredResults length`);
  }
  for (const [index, required] of fixture.requiredResults.entries()) {
    if (!required || typeof required.format !== "string" || typeof required.payload !== "string") {
      throw new Error(`${fixture.id}: requiredResults[${index}] must contain format and payload strings`);
    }
    if (typeof required.isGs1 !== "boolean") throw new Error(`${fixture.id}: requiredResults[${index}].isGs1 must be boolean`);
    // Resolving every required format makes unsupported/misclassified ground
    // truth fail even when the primary expectedFormat itself is valid.
    externalFixtureDirectory(required.format);
  }

  if (fixture.semanticResultPolicy !== "unique-format-payload-gs1") throw new Error(`${fixture.id}: invalid semanticResultPolicy`);
  if (!Array.isArray(fixture.physicalInstances) || fixture.physicalInstances.length === 0) {
    throw new Error(`${fixture.id}: physicalInstances must record visible Ground Truth`);
  }
  const physicalKeys = new Set<string>();
  let physicalCount = 0;
  const semanticResults: ExternalRequiredResult[] = [];
  for (const [index, instance] of fixture.physicalInstances.entries()) {
    if (!instance || typeof instance.format !== "string" || typeof instance.payload !== "string" || typeof instance.isGs1 !== "boolean") {
      throw new Error(`${fixture.id}: physicalInstances[${index}] must contain format, payload, and isGs1 Ground Truth`);
    }
    if (!Number.isInteger(instance.count) || instance.count < 1) throw new Error(`${fixture.id}: physicalInstances[${index}].count must be positive`);
    externalFixtureDirectory(instance.format);
    const key = resultKey(instance);
    if (physicalKeys.has(key)) throw new Error(`${fixture.id}: duplicate physical semantic entry must use count multiplicity`);
    physicalKeys.add(key);
    physicalCount += instance.count;
    semanticResults.push({ format: instance.format, payload: instance.payload, isGs1: instance.isGs1 });
  }
  if (fixture.physicalInstanceCount !== physicalCount) throw new Error(`${fixture.id}: physicalInstanceCount must equal physicalInstances multiplicity`);
  if (!exactExternalResultMultiset(semanticResults, fixture.requiredResults)) {
    throw new Error(`${fixture.id}: requiredResults must be derived from physicalInstances under semanticResultPolicy`);
  }

  const primaryPairPresent = fixture.requiredResults.some((result) =>
    result.format === fixture.expectedFormat
    && (fixture.expectedPayload === null || result.payload === fixture.expectedPayload));
  if (!primaryPairPresent) throw new Error(`${fixture.id}: expectedFormat/expectedPayload must identify a required result`);
  const primaryResult = fixture.requiredResults.find((result) => result.format === fixture.expectedFormat && result.payload === fixture.expectedPayload);
  if (fixture.expectedGs1 !== undefined && primaryResult?.isGs1 !== fixture.expectedGs1) {
    throw new Error(`${fixture.id}: expectedGs1 must match the primary required result`);
  }
  if (fixture.format !== fixture.expectedFormat) throw new Error(`${fixture.id}: format must match expectedFormat`);
  if (fixture.formatClass !== externalFormatClass(fixture.expectedFormat)) throw new Error(`${fixture.id}: formatClass does not match expectedFormat`);
  if (!Number.isFinite(fixture.orientation)) throw new Error(`${fixture.id}: orientation must be finite`);
  if (!Array.isArray(fixture.difficultyTags) || fixture.difficultyTags.length === 0) throw new Error(`${fixture.id}: difficultyTags must be non-empty`);

  const normalized = fixture.file.replaceAll("\\", "/");
  if (path.posix.isAbsolute(normalized) || path.posix.normalize(normalized) !== normalized) {
    throw new Error(`${fixture.id}: original path must be normalized and repository-relative`);
  }
  const prefix = `fixtures/alpha5/external-open-license/${externalFixtureDirectory(fixture.expectedFormat)}/`;
  if (!normalized.startsWith(prefix) || normalized.includes("/derived/")) {
    throw new Error(`${fixture.id}: original is outside the expected family directory`);
  }
}
