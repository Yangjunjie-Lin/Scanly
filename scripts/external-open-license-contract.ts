import path from "node:path";
import { normalizeRetailBarcode } from "@scanly/core";
import type { BarcodeFormat } from "@scanly/scenario-schema";

export const EXTERNAL_PROVENANCE_NOTE = "Third-party open-license real-world photograph; not project-owned.";
export const EXTERNAL_GROUND_TRUTH_REGISTRY_PATH = "fixtures/alpha5/external-open-license/ground-truth-registry.json";
export const EXTERNAL_GROUND_TRUTH_INDEPENDENCE_STATEMENT = "Expected results were recorded from source-image review and pinned upstream answers before Scanly verification; observed Scanly decoder output never defines or updates expected results.";

const COMMONS_REVIEW_METHOD = "maintainer-source-image-review-with-independent-cross-check";
const ZXING_REVIEW_METHOD = "upstream-reference-answer";
const CROSS_CHECK_COVERAGE_CLAIM = "corroborative-only-not-100-percent-decode";
const AUDITED_CC_LICENSE_VERSIONS = new Set(["2.0", "3.0", "4.0"]);

const ZXING_SOURCE_REVISION = "19aa2d8254410e161f04dc3c928e68d5e90233c2";
const ZXING_CAMERA_PROVENANCE_COMMIT = "f5124cec37e482cc58e6a4c9630e09191a3143e1";
const ZXING_FIXTURE_PATH = "/core/src/test/resources/blackbox/pdf417-2/";
const ZXING_LICENSE_EVIDENCE_PATH = `/zxing/zxing/blob/${ZXING_SOURCE_REVISION}/.reuse/dep5`;

interface AuditedZxingFixture {
  file: string;
  originalFilename: string;
  sha256: string;
  answerFilename: string;
  answerSha256: string;
  answerPayload: string;
}

const AUDITED_ZXING_FIXTURES: Readonly<Record<string, AuditedZxingFixture>> = Object.freeze({
  "external-zxing-android-camera-pdf417-2-01": Object.freeze({
    file: "fixtures/alpha5/external-open-license/pdf417/zxing-android-camera-pdf417-2-01.png",
    originalFilename: "01.png",
    sha256: "b036c6b9d6c1d36cc44651975004226fb16b5d1bdded83d6461ef473b3c978f1",
    answerFilename: "01.txt",
    answerSha256: "c775e7b757ede630cd0aa1113bd102661ab38829ca52a6422ab782862f268646",
    answerPayload: "1234567890",
  }),
  "external-zxing-android-camera-pdf417-2-08": Object.freeze({
    file: "fixtures/alpha5/external-open-license/pdf417/zxing-android-camera-pdf417-2-08.png",
    originalFilename: "08.png",
    sha256: "98454d87ebaf740d136e786be1cd3d97a3b8621f40f917b2d0ce64fbf5d36044",
    answerFilename: "08.txt",
    answerSha256: "35a6729004eb1cf2110e103272f567ccb916de9e25a1d3153763f5b7544c3c63",
    answerPayload: "A PDF 417 barcode with ASCII text",
  }),
  "external-zxing-android-camera-pdf417-2-16": Object.freeze({
    file: "fixtures/alpha5/external-open-license/pdf417/zxing-android-camera-pdf417-2-16.png",
    originalFilename: "16.png",
    sha256: "e33a9ff2781ef1c4f3bd711ceb05cbb8b5351e9f444a24d4fca3470a4a5ac0a0",
    answerFilename: "16.txt",
    answerSha256: "8e37a35e11f344e61b1e296d69eeaf2da4dc6d6dcd4e261ffb14f0c0e0e740e2",
    answerPayload: "A larger PDF 417 barcode with a greater amount of text. This is a more difficult test for mobile devices to resolve.",
  }),
});

export const EXTERNAL_PHOTO_FAMILIES = ["data_matrix", "pdf417", "code_128", "retail"] as const;
export type ExternalPhotoFamily = (typeof EXTERNAL_PHOTO_FAMILIES)[number];

export interface ExternalRequiredResult {
  format: BarcodeFormat;
  payload: string;
  isGs1?: boolean;
}

export interface ExternalGroundTruthCrossCheck {
  tool: "libdmtx" | "pyzbar";
  version: "0.1.10" | "0.1.9";
  outcome: "all-required-results-corroborated" | "partial-corroboration" | "no-decode-result";
  humanReadableLabelReview: "performed-where-present";
  coverageClaim: "corroborative-only-not-100-percent-decode";
}

export interface ExternalGroundTruthReview {
  method: "maintainer-source-image-review-with-independent-cross-check" | "upstream-reference-answer";
  reviewer: string;
  reviewedAt: string;
  evidenceUrl: string;
  evidenceSha256: string;
  independentCrossCheck?: ExternalGroundTruthCrossCheck;
}

export interface ExternalGroundTruthRecord {
  id: string;
  sourcePage: string;
  originalUrl: string;
  fixtureSha256: string;
  requiredResults: ExternalRequiredResult[];
}

export interface ExternalGroundTruthRegistry {
  schemaVersion: "1.0-beta1-external-ground-truth";
  independenceStatement: string;
  records: ExternalGroundTruthRecord[];
}

export interface ExternalPhysicalInstance extends ExternalRequiredResult {
  isGs1: boolean;
  count: number;
}

export interface ExternalResultDiff {
  missing: ExternalRequiredResult[];
  unexpected: ExternalRequiredResult[];
}

export interface ExternalVerificationResult {
  id: string;
  requiredResults: ExternalRequiredResult[];
  groundTruthReview: ExternalGroundTruthReview;
  missingResults: ExternalRequiredResult[];
  unexpectedResults: ExternalRequiredResult[];
}

function sameGroundTruthResults(
  left: readonly ExternalRequiredResult[],
  right: readonly ExternalRequiredResult[],
): boolean {
  return exactExternalResultMultiset(left, right);
}

/**
 * Binds the fixture manifest to a separately tracked, decoder-independent
 * Ground Truth registry. Observed decoder results are deliberately absent
 * from both inputs and can never become expected values through this path.
 */
export function validateExternalGroundTruthRegistry(
  fixtures: readonly ExternalFixture[],
  registry: ExternalGroundTruthRegistry,
): void {
  if (registry?.schemaVersion !== "1.0-beta1-external-ground-truth") {
    throw new Error("External Ground Truth registry has an unsupported schemaVersion");
  }
  if (registry.independenceStatement !== EXTERNAL_GROUND_TRUTH_INDEPENDENCE_STATEMENT) {
    throw new Error("External Ground Truth registry must record decoder independence");
  }
  if (!Array.isArray(registry.records)) throw new Error("External Ground Truth registry records are missing");

  const byId = new Map<string, ExternalGroundTruthRecord>();
  for (const record of registry.records) {
    if (!record || typeof record.id !== "string" || record.id.length === 0) {
      throw new Error("External Ground Truth registry contains an invalid fixture id");
    }
    if (byId.has(record.id)) throw new Error(`External Ground Truth registry contains duplicate id: ${record.id}`);
    if (!Array.isArray(record.requiredResults) || record.requiredResults.length === 0) {
      throw new Error(`${record.id}: external Ground Truth registry requiredResults are missing`);
    }
    if (typeof record.sourcePage !== "string"
      || typeof record.originalUrl !== "string"
      || !/^[a-f0-9]{64}$/.test(record.fixtureSha256)) {
      throw new Error(`${record.id}: external Ground Truth registry source binding is incomplete`);
    }
    byId.set(record.id, record);
  }
  if (byId.size !== fixtures.length) {
    throw new Error(`External Ground Truth registry fixture count ${byId.size} does not match manifest fixture count ${fixtures.length}`);
  }
  for (const fixture of fixtures) {
    const record = byId.get(fixture.id);
    if (!record) throw new Error(`${fixture.id}: missing from external Ground Truth registry`);
    if (!sameGroundTruthResults(fixture.requiredResults, record.requiredResults)) {
      throw new Error(`${fixture.id}: manifest requiredResults differ from the decoder-independent Ground Truth registry`);
    }
    if (fixture.sourcePage !== record.sourcePage
      || fixture.originalUrl !== record.originalUrl
      || fixture.sha256 !== record.fixtureSha256) {
      throw new Error(`${fixture.id}: manifest source URL or fixture SHA differs from the audited Ground Truth registry`);
    }
    byId.delete(fixture.id);
  }
  if (byId.size > 0) throw new Error(`External Ground Truth registry contains unknown fixture ids: ${[...byId.keys()].join(", ")}`);
}

export interface ExternalPhotoFamilyEvidence {
  photoCount: number;
  requiredResultCount: number;
  matchedResultCount: number;
  semanticRecall: number;
  photoCountPassed: boolean;
  semanticRecallPassed: boolean;
}

export interface ExternalPhotoGateEvidence {
  minimumPhotoCount: number;
  minimumPhotosPerFamily: number;
  minimumOverallSemanticRecall: number;
  minimumFamilySemanticRecall: number;
  photoCount: number;
  requiredResultCount: number;
  matchedResultCount: number;
  overallSemanticRecall: number;
  unexpectedResultCount: number;
  formatMisclassificationCount: number;
  gs1MisclassificationCount: number;
  provenanceLicenseCameraSafetyComplete: boolean;
  families: Record<ExternalPhotoFamily, ExternalPhotoFamilyEvidence>;
  pass: boolean;
  failureReasons: string[];
  physicalDeviceEvidence: "unavailable";
  beta1Release: "NO_GO";
}

export interface ExternalFixture {
  id: string;
  file: string;
  format: BarcodeFormat;
  formatClass: "matrix" | "stacked" | "linear";
  sourceType: "external-open-license";
  sourceRepository: "Wikimedia Commons" | "ZXing GitHub";
  sourcePage: string;
  sourceRevision?: string;
  cameraProvenanceUrl?: string;
  licenseEvidenceUrl?: string;
  originalUrl: string;
  originalFilename: string;
  originalWidth: number;
  originalHeight: number;
  originalByteLength: number;
  assetKind: "camera-photograph";
  author: string;
  license: string;
  licenseUrl: string;
  rightsReviewStatus: "verified";
  sensitiveDataReviewStatus: "passed";
  attribution: string;
  retrievedAt: string;
  modifications: unknown[];
  expectedOutcome: "decode";
  expectedResultCount: number;
  requiredResults: ExternalRequiredResult[];
  groundTruthReview: ExternalGroundTruthReview;
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

export function externalPhotoFamily(format: BarcodeFormat): ExternalPhotoFamily {
  if (format === "data_matrix" || format === "pdf417" || format === "code_128") return format;
  if (["ean_13", "ean_8", "upc_a", "upc_e"].includes(format)) return "retail";
  throw new Error(`External Alpha.5 fixture format is unsupported: ${format}`);
}

/**
 * Parses provenance URLs without accepting URL-normalization surprises. This
 * deliberately rejects credentials, explicit ports, redirects encoded as a
 * query/fragment, and non-canonical spellings before callers inspect the
 * exact hostname and pathname.
 */
function parseStrictHttpsUrl(value: string): URL | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:"
      || parsed.username !== ""
      || parsed.password !== ""
      || parsed.port !== ""
      || parsed.search !== ""
      || parsed.hash !== ""
      || parsed.href !== value) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function hasExactPath(url: URL, pathname: string): boolean {
  return url.pathname === pathname || url.pathname === `${pathname}/`;
}

function matchesStrictHttpsUrl(value: string | undefined, hostname: string, pathname: string): boolean {
  if (value === undefined) return false;
  const url = parseStrictHttpsUrl(value);
  return url !== null && url.hostname === hostname && url.pathname === pathname;
}

function normalizeExternalLicenseName(license: string): string {
  return license.trim().replaceAll("\u2011", "-").replaceAll("\u2013", "-");
}

export function isAllowedExternalLicense(license: string, licenseUrl: string): boolean {
  const normalized = normalizeExternalLicenseName(license);
  const url = parseStrictHttpsUrl(licenseUrl);
  if (!url || /\b(?:nc|nd)\b/i.test(normalized)) return false;
  if (/^public domain$/i.test(normalized)) {
    return url.hostname === "creativecommons.org"
      && (/^\/publicdomain\/(?:mark|zero)\/1\.0\/?$/.test(url.pathname));
  }
  if (/^cc0(?: 1\.0)?$/i.test(normalized)) {
    return url.hostname === "creativecommons.org" && hasExactPath(url, "/publicdomain/zero/1.0");
  }
  if (/^apache-2\.0$/i.test(normalized)) {
    return url.hostname === "www.apache.org" && url.pathname === "/licenses/LICENSE-2.0";
  }
  const match = /^cc by(-sa)? (\d+\.\d+)$/i.exec(normalized);
  if (!match || !AUDITED_CC_LICENSE_VERSIONS.has(match[2])) return false;
  const family = match[1] ? "by-sa" : "by";
  return url.hostname === "creativecommons.org" && hasExactPath(url, `/licenses/${family}/${match[2]}`);
}

export function validateExternalFixtureSet(fixtures: readonly ExternalFixture[]): void {
  for (const field of ["id", "file", "sourcePage", "originalUrl", "sha256"] as const) {
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

/** Applies the declared unique `(format, payload, isGs1)` semantic policy. */
export function deduplicateExternalSemanticResults<T extends ExternalRequiredResult>(results: readonly T[]): T[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = resultKey(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validateExternalFixture(fixture: ExternalFixture): void {
  const requiredMetadata = [
    fixture.id,
    fixture.file,
    fixture.sourcePage,
    fixture.originalUrl,
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
  const review = fixture.groundTruthReview;
  if (!review
    || typeof review.method !== "string"
    || typeof review.reviewer !== "string"
    || review.reviewer.trim().length === 0
    || typeof review.reviewedAt !== "string"
    || !Number.isFinite(Date.parse(review.reviewedAt))
    || typeof review.evidenceUrl !== "string"
    || review.evidenceUrl.length === 0
    || typeof review.evidenceSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(review.evidenceSha256)) {
    throw new Error(`${fixture.id}: groundTruthReview must contain method, reviewer, reviewedAt, evidenceUrl, and evidenceSha256`);
  }
  if (fixture.sourceType !== "external-open-license"
    || !["Wikimedia Commons", "ZXing GitHub"].includes(fixture.sourceRepository)) {
    throw new Error(`${fixture.id}: invalid source classification`);
  }
  if (fixture.sourceRepository === "Wikimedia Commons") {
    const sourcePage = parseStrictHttpsUrl(fixture.sourcePage);
    if (sourcePage === null
      || sourcePage.hostname !== "commons.wikimedia.org"
      || !/^\/wiki\/File:[^/]+$/.test(sourcePage.pathname)) {
      throw new Error(`${fixture.id}: sourcePage must be a canonical HTTPS Wikimedia Commons File page`);
    }
    const originalUrl = parseStrictHttpsUrl(fixture.originalUrl);
    if (originalUrl === null
      || originalUrl.hostname !== "upload.wikimedia.org"
      || !/^\/wikipedia\/commons\/.+/.test(originalUrl.pathname)) {
      throw new Error(`${fixture.id}: originalUrl must be a canonical HTTPS upload.wikimedia.org /wikipedia/commons asset`);
    }
    if (/^apache-2\.0$/i.test(normalizeExternalLicenseName(fixture.license))) {
      throw new Error(`${fixture.id}: Apache-2.0 is limited to the pinned ZXing GitHub cohort`);
    }
    if (review.method !== COMMONS_REVIEW_METHOD
      || review.evidenceUrl !== fixture.originalUrl
      || review.evidenceSha256 !== fixture.sha256) {
      throw new Error(`${fixture.id}: Commons Ground Truth review must bind the source-image URL and exact image SHA-256`);
    }
    const crossCheck = review.independentCrossCheck;
    const expectedTool = fixture.expectedFormat === "data_matrix" ? "libdmtx" : "pyzbar";
    const expectedVersion = expectedTool === "libdmtx" ? "0.1.10" : "0.1.9";
    if (!crossCheck
      || crossCheck.tool !== expectedTool
      || crossCheck.version !== expectedVersion
      || !["all-required-results-corroborated", "partial-corroboration", "no-decode-result"].includes(crossCheck.outcome)
      || crossCheck.humanReadableLabelReview !== "performed-where-present"
      || crossCheck.coverageClaim !== CROSS_CHECK_COVERAGE_CLAIM) {
      throw new Error(`${fixture.id}: Commons Ground Truth review must record the audited ${expectedTool} ${expectedVersion} corroborative cross-check and human-readable-label review without claiming 100% decoder coverage`);
    }
  }
  if (fixture.sourceRepository === "ZXing GitHub") {
    if (fixture.sourceRevision !== ZXING_SOURCE_REVISION) {
      throw new Error(`${fixture.id}: ZXing sourceRevision must equal the audited revision ${ZXING_SOURCE_REVISION}`);
    }
    const audited = AUDITED_ZXING_FIXTURES[fixture.id];
    if (audited === undefined) {
      throw new Error(`${fixture.id}: ZXing fixture is outside the audited three-file camera cohort`);
    }
    if (fixture.file !== audited.file
      || fixture.originalFilename !== audited.originalFilename
      || fixture.sha256 !== audited.sha256) {
      throw new Error(`${fixture.id}: ZXing local file, originalFilename, and sha256 must match the audited fixture identity`);
    }
    const sourcePath = `/zxing/zxing/blob/${ZXING_SOURCE_REVISION}${ZXING_FIXTURE_PATH}${audited.originalFilename}`;
    const originalPath = `/zxing/zxing/${ZXING_SOURCE_REVISION}${ZXING_FIXTURE_PATH}${audited.originalFilename}`;
    if (!matchesStrictHttpsUrl(fixture.sourcePage, "github.com", sourcePath)
      || !matchesStrictHttpsUrl(fixture.originalUrl, "raw.githubusercontent.com", originalPath)) {
      throw new Error(`${fixture.id}: ZXing source and raw URLs must exactly match the audited revision and file`);
    }
    if (fixture.expectedFormat !== "pdf417") throw new Error(`${fixture.id}: audited ZXing camera cohort is limited to PDF417`);
    if (fixture.license !== "Apache-2.0"
      || !matchesStrictHttpsUrl(fixture.licenseEvidenceUrl, "github.com", ZXING_LICENSE_EVIDENCE_PATH)) {
      throw new Error(`${fixture.id}: ZXing Apache-2.0 coverage evidence is missing or unpinned`);
    }
    if (!matchesStrictHttpsUrl(
      fixture.cameraProvenanceUrl,
      "github.com",
      `/zxing/zxing/commit/${ZXING_CAMERA_PROVENANCE_COMMIT}`,
    )) {
      throw new Error(`${fixture.id}: ZXing Android-camera provenance is missing`);
    }
    const answerPath = `/zxing/zxing/${ZXING_SOURCE_REVISION}${ZXING_FIXTURE_PATH}${audited.answerFilename}`;
    const pinnedAnswer = [{ format: "pdf417" as const, payload: audited.answerPayload, isGs1: false }];
    if (review.method !== ZXING_REVIEW_METHOD
      || !matchesStrictHttpsUrl(review.evidenceUrl, "raw.githubusercontent.com", answerPath)
      || review.evidenceSha256 !== audited.answerSha256
      || review.independentCrossCheck !== undefined
      || !Array.isArray(fixture.requiredResults)
      || !exactExternalResultMultiset(fixture.requiredResults, pinnedAnswer)) {
      throw new Error(`${fixture.id}: ZXing Ground Truth must exactly match the pinned upstream ${audited.answerFilename} answer URL, SHA-256, and payload`);
    }
  }
  if (!isAllowedExternalLicense(fixture.license, fixture.licenseUrl)) {
    throw new Error(`${fixture.id}: license must be an audited redistributable PD, CC0, CC BY, CC BY-SA, or pinned ZXing Apache-2.0 license (NC/ND/unknown are not accepted)`);
  }
  if (fixture.assetKind !== "camera-photograph") throw new Error(`${fixture.id}: assetKind must be camera-photograph`);
  if (fixture.rightsReviewStatus !== "verified") throw new Error(`${fixture.id}: rights review is not verified`);
  if (fixture.sensitiveDataReviewStatus !== "passed") throw new Error(`${fixture.id}: sensitive-data review has not passed`);
  for (const [name, value] of [
    ["originalWidth", fixture.originalWidth],
    ["originalHeight", fixture.originalHeight],
    ["originalByteLength", fixture.originalByteLength],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${fixture.id}: ${name} must be a positive integer`);
  }
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


/** Derives the curated camera-photo gate without treating missed symbols as false positives. */
export function deriveExternalPhotoGate(
  fixtures: readonly ExternalFixture[],
  results: readonly ExternalVerificationResult[],
): ExternalPhotoGateEvidence {
  const resultsById = new Map(results.map((result) => [result.id, result]));
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));
  const resultSetComplete = results.length === fixtures.length
    && resultsById.size === results.length
    && results.every((result) => fixtureIds.has(result.id));
  const resultGroundTruthConsistent = results.every((result) => {
    const fixture = fixtures.find((candidate) => candidate.id === result.id);
    return fixture !== undefined
      && exactExternalResultMultiset(fixture.requiredResults, result.requiredResults)
      && JSON.stringify(fixture.groundTruthReview) === JSON.stringify(result.groundTruthReview);
  });
  const families = Object.fromEntries(EXTERNAL_PHOTO_FAMILIES.map((family) => [family, {
    photoCount: 0,
    requiredResultCount: 0,
    matchedResultCount: 0,
    semanticRecall: 0,
    photoCountPassed: false,
    semanticRecallPassed: false,
  }])) as Record<ExternalPhotoFamily, ExternalPhotoFamilyEvidence>;

  let requiredResultCount = 0;
  let matchedResultCount = 0;
  let unexpectedResultCount = 0;
  let formatMisclassificationCount = 0;
  let gs1MisclassificationCount = 0;
  for (const fixture of fixtures) {
    families[externalPhotoFamily(fixture.expectedFormat)].photoCount += 1;
    const result = resultsById.get(fixture.id);
    for (const required of fixture.requiredResults) {
      const family = externalPhotoFamily(required.format);
      families[family].requiredResultCount += 1;
      requiredResultCount += 1;
    }
    if (!result) continue;
    const missingCounts = resultMultiset(result.missingResults);
    for (const required of fixture.requiredResults) {
      const key = resultKey(required);
      const missing = missingCounts.get(key) ?? 0;
      if (missing > 0) {
        if (missing === 1) missingCounts.delete(key);
        else missingCounts.set(key, missing - 1);
        continue;
      }
      families[externalPhotoFamily(required.format)].matchedResultCount += 1;
      matchedResultCount += 1;
    }
    unexpectedResultCount += result.unexpectedResults.length;
    formatMisclassificationCount += result.unexpectedResults.filter((actual) => isExternalFormatMisclassification(fixture.requiredResults, actual)).length;
    gs1MisclassificationCount += result.unexpectedResults.filter((actual) => isExternalGs1Misclassification(fixture.requiredResults, actual)).length;
  }

  const minimumPhotoCount = 12;
  const minimumPhotosPerFamily = 3;
  const minimumOverallSemanticRecall = 0.8;
  const minimumFamilySemanticRecall = 2 / 3;
  for (const evidence of Object.values(families)) {
    evidence.semanticRecall = evidence.requiredResultCount === 0 ? 0 : evidence.matchedResultCount / evidence.requiredResultCount;
    evidence.photoCountPassed = evidence.photoCount >= minimumPhotosPerFamily;
    evidence.semanticRecallPassed = evidence.semanticRecall >= minimumFamilySemanticRecall;
  }
  const overallSemanticRecall = requiredResultCount === 0 ? 0 : matchedResultCount / requiredResultCount;
  const provenanceLicenseCameraSafetyComplete = fixtures.every((fixture) => {
    try {
      validateExternalFixture(fixture);
      return true;
    } catch {
      return false;
    }
  });
  const failureReasons: string[] = [];
  if (fixtures.length < minimumPhotoCount) failureReasons.push(`photo count ${fixtures.length}/${minimumPhotoCount}`);
  if (!resultSetComplete) failureReasons.push("verification result set does not exactly cover the fixture set");
  if (!resultGroundTruthConsistent) failureReasons.push("verification result Ground Truth differs from the manifest");
  for (const family of EXTERNAL_PHOTO_FAMILIES) {
    const evidence = families[family];
    if (!evidence.photoCountPassed) failureReasons.push(`${family} photo count ${evidence.photoCount}/${minimumPhotosPerFamily}`);
    if (!evidence.semanticRecallPassed) failureReasons.push(`${family} semantic recall ${evidence.matchedResultCount}/${evidence.requiredResultCount}`);
  }
  if (overallSemanticRecall < minimumOverallSemanticRecall) failureReasons.push(`overall semantic recall ${matchedResultCount}/${requiredResultCount}`);
  if (unexpectedResultCount > 0) failureReasons.push(`unexpected results ${unexpectedResultCount}`);
  if (formatMisclassificationCount > 0) failureReasons.push(`format misclassifications ${formatMisclassificationCount}`);
  if (gs1MisclassificationCount > 0) failureReasons.push(`GS1 misclassifications ${gs1MisclassificationCount}`);
  if (!provenanceLicenseCameraSafetyComplete) failureReasons.push("provenance/license/camera/safety metadata incomplete");

  return {
    minimumPhotoCount,
    minimumPhotosPerFamily,
    minimumOverallSemanticRecall,
    minimumFamilySemanticRecall,
    photoCount: fixtures.length,
    requiredResultCount,
    matchedResultCount,
    overallSemanticRecall,
    unexpectedResultCount,
    formatMisclassificationCount,
    gs1MisclassificationCount,
    provenanceLicenseCameraSafetyComplete,
    families,
    pass: failureReasons.length === 0,
    failureReasons,
    physicalDeviceEvidence: "unavailable",
    beta1Release: "NO_GO",
  };
}
