import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTERNAL_GROUND_TRUTH_INDEPENDENCE_STATEMENT,
  EXTERNAL_GROUND_TRUTH_REGISTRY_PATH,
  EXTERNAL_PROVENANCE_NOTE,
  deriveExternalPhotoGate,
  deduplicateExternalSemanticResults,
  diffExternalResultMultiset,
  exactExternalResultMultiset,
  isExternalFormatMisclassification,
  isExternalGs1Misclassification,
  isAllowedExternalLicense,
  validateExternalFixture,
  validateExternalFixtureSet,
  validateExternalGroundTruthRegistry,
  type ExternalFixture,
  type ExternalGroundTruthRegistry,
  type ExternalVerificationResult,
} from "../../scripts/external-open-license-contract";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

const contractFixture = (overrides: Partial<ExternalFixture> = {}): ExternalFixture => {
  const fixture = {
  id: "external-mixed-contract",
  file: "fixtures/alpha5/external-open-license/code128/mixed.jpg",
  format: "code_128",
  formatClass: "linear",
  sourceType: "external-open-license",
  sourceRepository: "Wikimedia Commons",
  sourcePage: "https://commons.wikimedia.org/wiki/File:Mixed.jpg",
  originalUrl: "https://upload.wikimedia.org/wikipedia/commons/example/Mixed.jpg",
  originalFilename: "Mixed.jpg",
  originalWidth: 1600,
  originalHeight: 1200,
  originalByteLength: 456789,
  assetKind: "camera-photograph",
  author: "Example Author",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  rightsReviewStatus: "verified",
  sensitiveDataReviewStatus: "passed",
  attribution: "Example Author, CC BY 4.0",
  retrievedAt: "2026-08-09T00:00:00.000Z",
  modifications: [],
  expectedOutcome: "decode",
  expectedResultCount: 2,
  requiredResults: [
    { format: "code_128", payload: "LOT-123", isGs1: false },
    { format: "ean_13", payload: "5901234123457", isGs1: false },
  ],
  physicalInstanceCount: 2,
  physicalInstances: [
    { format: "code_128", payload: "LOT-123", isGs1: false, count: 1 },
    { format: "ean_13", payload: "5901234123457", isGs1: false, count: 1 },
  ],
  semanticResultPolicy: "unique-format-payload-gs1",
  orientation: 0,
  difficultyTags: ["multiple"],
  expectedFormat: "code_128",
  expectedPayload: "LOT-123",
  payloadVerificationStatus: "verified",
  publicRepositorySafe: true,
  provenanceNote: EXTERNAL_PROVENANCE_NOTE,
  sha256: "a".repeat(64),
    visualVerificationStatus: "verified",
    ...overrides,
  } as ExternalFixture;
  if (!Object.prototype.hasOwnProperty.call(overrides, "groundTruthReview")) {
    fixture.groundTruthReview = {
      method: "maintainer-source-image-review-with-independent-cross-check",
      reviewer: "Scanly evidence maintainer",
      reviewedAt: "2026-08-09T18:06:46.314Z",
      evidenceUrl: fixture.originalUrl,
      evidenceSha256: fixture.sha256,
      independentCrossCheck: {
        tool: fixture.expectedFormat === "data_matrix" ? "libdmtx" : "pyzbar",
        version: fixture.expectedFormat === "data_matrix" ? "0.1.10" : "0.1.9",
        outcome: "all-required-results-corroborated",
        humanReadableLabelReview: "performed-where-present",
        coverageClaim: "corroborative-only-not-100-percent-decode",
      },
    };
  }
  return fixture;
};

const familyFixture = (family: "data_matrix" | "pdf417" | "code_128" | "retail", index: number): ExternalFixture => {
  const format = family === "retail" ? "ean_13" : family;
  const directory = family === "data_matrix" ? "data-matrix" : family === "code_128" ? "code128" : family;
  const payload = family === "retail" ? `59012341234${index}7` : `${family.toUpperCase()}-${index}`;
  return contractFixture({
    id: `${family}-${index}`,
    file: `fixtures/alpha5/external-open-license/${directory}/${family}-${index}.jpg`,
    format,
    formatClass: family === "data_matrix" ? "matrix" : family === "pdf417" ? "stacked" : "linear",
    sourcePage: `https://commons.wikimedia.org/wiki/File:${family}-${index}.jpg`,
    originalUrl: `https://upload.wikimedia.org/wikipedia/commons/${family}-${index}.jpg`,
    originalFilename: `${family}-${index}.jpg`,
    sha256: index.toString(16).repeat(64),
    expectedResultCount: 1,
    requiredResults: [{ format, payload, isGs1: false }],
    physicalInstanceCount: 1,
    physicalInstances: [{ format, payload, isGs1: false, count: 1 }],
    expectedFormat: format,
    expectedPayload: payload,
  });
};

describe("external open-license Alpha.5 cohort", () => {
  it("keeps third-party photographs separate from project-owned evidence", () => {
    const external = JSON.parse(read("fixtures/alpha5/external-open-license/manifest.json")) as { fixtures: Array<Record<string, unknown>> };
    const project = JSON.parse(read("fixtures/alpha5/project-photos/manifest.json")) as { fixtures: Array<Record<string, unknown>> };
    expect(external.fixtures.every((fixture) => fixture.sourceType === "external-open-license")).toBe(true);
    expect(external.fixtures.every((fixture) => fixture.sourceType !== "project-photo")).toBe(true);
    expect(project.fixtures.every((fixture) => fixture.sourceType === "project-photo")).toBe(true);
    expect(project.fixtures.every((fixture) => fixture.sourceType !== "external-open-license")).toBe(true);
  });

  it("validates provenance, payload honesty, public safety, and original hashes", () => {
    const manifest = JSON.parse(read("fixtures/alpha5/external-open-license/manifest.json")) as { fixtures: Array<Record<string, unknown>> };
    for (const fixture of manifest.fixtures) {
      expect(fixture).toMatchObject({
        sourceType: "external-open-license",
        assetKind: "camera-photograph",
        rightsReviewStatus: "verified",
        sensitiveDataReviewStatus: "passed",
        publicRepositorySafe: true,
        provenanceNote: "Third-party open-license real-world photograph; not project-owned.",
      });
      expect(["Wikimedia Commons", "ZXing GitHub"]).toContain(fixture.sourceRepository);
      for (const key of ["sourcePage", "originalUrl", "originalFilename", "author", "license", "licenseUrl", "attribution", "retrievedAt", "expectedFormat"]) {
        expect(typeof fixture[key], key).toBe("string");
        expect((fixture[key] as string).length, key).toBeGreaterThan(0);
      }
      expect(Array.isArray(fixture.modifications)).toBe(true);
      for (const key of ["originalWidth", "originalHeight", "originalByteLength"]) {
        expect(Number.isInteger(fixture[key]), key).toBe(true);
        expect(fixture[key] as number, key).toBeGreaterThan(0);
      }
      expect(fixture.payloadVerificationStatus).not.toBe("sensitive");
      if (fixture.payloadVerificationStatus === "unknown") expect(fixture.expectedPayload).toBeNull();
      expect(fixture.expectedOutcome).toBe("decode");
      expect(Array.isArray(fixture.requiredResults)).toBe(true);
      expect((fixture.requiredResults as unknown[]).length).toBeGreaterThan(0);
      expect(fixture.expectedResultCount).toBe((fixture.requiredResults as unknown[]).length);
      expect(fixture.groundTruthReview).toMatchObject({
        reviewer: "Scanly evidence maintainer",
      });
      expect(() => validateExternalFixture(fixture as unknown as ExternalFixture)).not.toThrow();
      const bytes = fs.readFileSync(path.join(ROOT, fixture.file as string));
      expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
    }
  });

  it("binds manifest expectations to the separately tracked decoder-independent Ground Truth registry", () => {
    const manifest = JSON.parse(read("fixtures/alpha5/external-open-license/manifest.json")) as {
      groundTruthRegistry: string;
      fixtures: ExternalFixture[];
    };
    const registry = JSON.parse(read(EXTERNAL_GROUND_TRUTH_REGISTRY_PATH)) as ExternalGroundTruthRegistry;
    expect(manifest.groundTruthRegistry).toBe(EXTERNAL_GROUND_TRUTH_REGISTRY_PATH);
    expect(registry.independenceStatement).toBe(EXTERNAL_GROUND_TRUTH_INDEPENDENCE_STATEMENT);
    expect(() => validateExternalGroundTruthRegistry(manifest.fixtures, registry)).not.toThrow();

    const tampered = JSON.parse(JSON.stringify(registry)) as ExternalGroundTruthRegistry;
    tampered.records[0].requiredResults[0].payload = "OBSERVED-OUTPUT-MUST-NOT-BECOME-EXPECTED";
    expect(() => validateExternalGroundTruthRegistry(manifest.fixtures, tampered))
      .toThrow(/manifest requiredResults differ from the decoder-independent Ground Truth registry/);

    const sourceTampered = JSON.parse(JSON.stringify(registry)) as ExternalGroundTruthRegistry;
    sourceTampered.records[0].originalUrl = "https://upload.wikimedia.org/wikipedia/commons/0/00/Unreviewed.jpg";
    expect(() => validateExternalGroundTruthRegistry(manifest.fixtures, sourceTampered))
      .toThrow(/manifest source URL or fixture SHA differs from the audited Ground Truth registry/);

    const bytesTampered = JSON.parse(JSON.stringify(registry)) as ExternalGroundTruthRegistry;
    bytesTampered.records[0].fixtureSha256 = "a".repeat(64);
    expect(() => validateExternalGroundTruthRegistry(manifest.fixtures, bytesTampered))
      .toThrow(/manifest source URL or fixture SHA differs from the audited Ground Truth registry/);
  });

  it("keeps the tracked WASM validation report aligned with manifest Ground Truth", () => {
    const manifestText = read("fixtures/alpha5/external-open-license/manifest.json");
    const manifest = JSON.parse(manifestText) as {
      fixtures: Array<{ id: string; requiredResults: unknown[]; physicalInstanceCount: number }>;
    };
    const report = JSON.parse(read("fixtures/alpha5/external-open-license/validation-report.json")) as {
      schemaVersion: string;
      manifestSha256: string;
      groundTruthRegistrySha256: string;
      groundTruthAudit: {
        registryPath: string;
        fixtureCount: number;
        complete: boolean;
        decoderIndependent: boolean;
        independenceStatement: string;
      };
      sourceIdentity: { commitSha: string; treeSha: string; repositoryDirty: boolean };
      sdkVersion: string;
      engine: { id: string; version: string };
      status: string;
      fixtureCount: number;
      exactResultCount: number;
      requiredResultCount: number;
      visiblePhysicalInstanceCount: number;
      observedResultCount: number;
      falsePositiveCount: number;
      formatMisclassificationCount: number;
      gs1MisclassificationCount: number;
      semanticRecall: number;
      projectOwnedEvidence: { count: number; role: string };
      externalOpenLicenseCorpusCount: number;
      externalOpenLicenseGate: boolean;
      physicalDeviceEvidence: string;
      beta1Release: string;
      curatedOpenLicenseCameraPhotoGate: { pass: boolean; failureReasons: string[] };
      results: Array<{ id: string; correctnessPassed: boolean; groundTruthReview: unknown }>;
    };
    const projectPhotos = JSON.parse(read("fixtures/alpha5/project-photos/manifest.json")) as { fixtures: Array<{ sourceType: string }> };
    const projectOwnedRealPhotos = projectPhotos.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length;
    const expectedResults = manifest.fixtures.reduce((count, fixture) => count + fixture.requiredResults.length, 0);
    const visiblePhysicalInstances = manifest.fixtures.reduce((count, fixture) => count + fixture.physicalInstanceCount, 0);
    expect(report).toMatchObject({
      schemaVersion: "2.2-beta1-curated-open-license-photo-report",
      status: "PASS_CURATED_OPEN_LICENSE_CAMERA_PHOTOS",
      manifestSha256: crypto.createHash("sha256").update(manifestText.replaceAll("\r\n", "\n")).digest("hex"),
      groundTruthRegistrySha256: crypto.createHash("sha256").update(read(EXTERNAL_GROUND_TRUTH_REGISTRY_PATH).replaceAll("\r\n", "\n")).digest("hex"),
      groundTruthAudit: {
        registryPath: EXTERNAL_GROUND_TRUTH_REGISTRY_PATH,
        fixtureCount: manifest.fixtures.length,
        complete: true,
        decoderIndependent: true,
        independenceStatement: EXTERNAL_GROUND_TRUTH_INDEPENDENCE_STATEMENT,
      },
      // This tracked report is immutable Beta 1 evidence. Beta 2 regression
      // executes the verifier again; it must not relabel historical bytes as
      // though they had been produced by the current SDK version.
      sdkVersion: "2.0.0-beta.1",
      engine: { id: "zxing-cpp-wasm", version: "3.1.1+zxing-cpp.6c2961d" },
      fixtureCount: manifest.fixtures.length,
      requiredResultCount: expectedResults,
      visiblePhysicalInstanceCount: visiblePhysicalInstances,
      falsePositiveCount: 0,
      formatMisclassificationCount: 0,
      gs1MisclassificationCount: 0,
      projectOwnedEvidence: { count: projectOwnedRealPhotos, role: "informational-only" },
      externalOpenLicenseCorpusCount: manifest.fixtures.length,
      externalOpenLicenseGate: true,
      physicalDeviceEvidence: "unavailable",
      beta1Release: "NO_GO",
      curatedOpenLicenseCameraPhotoGate: { pass: true, failureReasons: [] },
    });
    expect(report.semanticRecall).toBe(expectedResults === 0 ? 0 : report.exactResultCount / expectedResults);
    expect(report.semanticRecall).toBeGreaterThanOrEqual(0.8);
    expect(report.observedResultCount).toBeGreaterThanOrEqual(report.exactResultCount);
    expect(report.results.every((result) => result.correctnessPassed)).toBe(true);
    expect(report.results.every((result) => typeof result.groundTruthReview === "object" && result.groundTruthReview !== null)).toBe(true);
    expect(report.sourceIdentity.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(report.sourceIdentity.treeSha).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof report.sourceIdentity.repositoryDirty).toBe("boolean");
    expect(report.results.map((result) => result.id).sort()).toEqual(manifest.fixtures.map((fixture) => fixture.id).sort());
  });

  it("matches all-format decode output as an exact format/payload/GS1 multiset", () => {
    const required = contractFixture().requiredResults;
    expect(exactExternalResultMultiset(required, [...required].reverse())).toBe(true);
    expect(exactExternalResultMultiset(required, [required[0]])).toBe(false);
    expect(exactExternalResultMultiset(required, [...required, { format: "upc_a", payload: "036000291452" }])).toBe(false);
    expect(exactExternalResultMultiset(required, [required[0], { format: "ean_13", payload: "5901234123458" }])).toBe(false);

    const duplicate = [{ format: "data_matrix" as const, payload: "SAME", isGs1: false }, { format: "data_matrix" as const, payload: "SAME", isGs1: false }];
    expect(exactExternalResultMultiset(duplicate, duplicate)).toBe(true);
    expect(exactExternalResultMultiset(duplicate, [duplicate[0], { format: "data_matrix", payload: "OTHER" }])).toBe(false);
    expect(deduplicateExternalSemanticResults(duplicate)).toEqual([duplicate[0]]);
    expect(deduplicateExternalSemanticResults([
      duplicate[0],
      { ...duplicate[0], isGs1: true },
      { ...duplicate[0], format: "code_128" },
    ])).toHaveLength(3);

    expect(diffExternalResultMultiset(required, [required[0], { format: "upc_a", payload: "036000291452" }])).toEqual({
      missing: [required[1]],
      unexpected: [{ format: "upc_a", payload: "036000291452" }],
    });
    expect(isExternalFormatMisclassification(
      [{ format: "upc_a", payload: "036000291452", isGs1: false }],
      { format: "ean_13", payload: "0036000291452", isGs1: false },
    )).toBe(true);
  });

  it("requires non-empty, count-consistent independent ground truth", () => {
    expect(() => validateExternalFixture(contractFixture())).not.toThrow();
    expect(() => validateExternalFixture(contractFixture({ groundTruthReview: undefined } as unknown as Partial<ExternalFixture>)))
      .toThrow(/groundTruthReview must contain/);
    expect(() => validateExternalFixture(contractFixture({
      groundTruthReview: {
        ...contractFixture().groundTruthReview,
        evidenceSha256: "b".repeat(64),
      },
    }))).toThrow(/bind the source-image URL and exact image SHA-256/);
    expect(() => validateExternalFixture(contractFixture({ requiredResults: [] }))).toThrow(/requiredResults must contain independent ground truth/);
    expect(() => validateExternalFixture(contractFixture({ expectedResultCount: 1 }))).toThrow(/expectedResultCount must equal requiredResults length/);
    expect(() => validateExternalFixture(contractFixture({ expectedOutcome: "no-symbol" } as unknown as Partial<ExternalFixture>))).toThrow(/expectedOutcome must be decode/);
    expect(() => validateExternalFixture(contractFixture({ payloadVerificationStatus: "unknown", expectedPayload: null }))).toThrow(/unknown payloads must not be guessed or admitted/);
  });

  it("allows only redistributable licenses and requires audited camera-photo metadata", () => {
    for (const [license, url] of [
      ["Public domain", "https://creativecommons.org/publicdomain/mark/1.0/"],
      ["CC0 1.0", "https://creativecommons.org/publicdomain/zero/1.0/"],
      ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"],
      ["CC BY-SA 3.0", "https://creativecommons.org/licenses/by-sa/3.0/"],
      ["Apache-2.0", "https://www.apache.org/licenses/LICENSE-2.0"],
    ]) expect(isAllowedExternalLicense(license, url)).toBe(true);
    for (const [license, url] of [
      ["CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"],
      ["CC BY-ND 4.0", "https://creativecommons.org/licenses/by-nd/4.0/"],
      ["CC BY 4.0", "https://creativecommons.org.evil.example/licenses/by/4.0/"],
      ["CC BY 4.0", "https://evil.example/creativecommons.org/licenses/by/4.0/"],
      ["CC BY 4.0", "https://user@creativecommons.org/licenses/by/4.0/"],
      ["CC BY 4.0", "https://creativecommons.org:444/licenses/by/4.0/"],
      ["CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/extra"],
      ["CC BY 999.0", "https://creativecommons.org/licenses/by/999.0/"],
      ["Apache-2.0", "https://www.apache.org.evil.example/licenses/LICENSE-2.0"],
      ["Apache-2.0", "https://evil.example/apache.org/licenses/LICENSE-2.0"],
      ["All rights reserved", "https://example.test/rights"],
      ["unknown", "https://example.test/license"],
    ]) expect(isAllowedExternalLicense(license, url)).toBe(false);

    expect(() => validateExternalFixture(contractFixture({ assetKind: "illustration" } as unknown as Partial<ExternalFixture>))).toThrow(/camera-photograph/);
    expect(() => validateExternalFixture(contractFixture({ rightsReviewStatus: "pending" } as unknown as Partial<ExternalFixture>))).toThrow(/rights review/);
    expect(() => validateExternalFixture(contractFixture({ sensitiveDataReviewStatus: "failed" } as unknown as Partial<ExternalFixture>))).toThrow(/sensitive-data review/);
    expect(() => validateExternalFixture(contractFixture({ originalByteLength: 0 }))).toThrow(/originalByteLength/);
    expect(() => validateExternalFixture(contractFixture({ license: "CC BY-NC 4.0", licenseUrl: "https://creativecommons.org/licenses/by-nc/4.0/" }))).toThrow(/redistributable/);
    for (const license of ["Apache-2.0", " Apache-2.0 ", "Apache\u20112.0", "Apache\u20132.0"]) {
      expect(() => validateExternalFixture(contractFixture({ license, licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0" })))
        .toThrow(/limited to the pinned ZXing GitHub cohort/);
    }
  });

  it("requires exact Wikimedia hosts, HTTPS authority, and provenance paths", () => {
    for (const sourcePage of [
      "https://commons.wikimedia.org.evil.example/wiki/File:Mixed.jpg",
      "https://evil.example/commons.wikimedia.org/wiki/File:Mixed.jpg",
      "http://commons.wikimedia.org/wiki/File:Mixed.jpg",
      "https://user@commons.wikimedia.org/wiki/File:Mixed.jpg",
      "https://commons.wikimedia.org:444/wiki/File:Mixed.jpg",
      "https://commons.wikimedia.org/wiki/Category:Mixed.jpg",
      "https://commons.wikimedia.org/wiki/File:Mixed.jpg?redirect=evil",
    ]) {
      expect(() => validateExternalFixture(contractFixture({ sourcePage }))).toThrow(/Wikimedia Commons File page/);
    }

    for (const originalUrl of [
      "https://upload.wikimedia.org.evil.example/wikipedia/commons/example/Mixed.jpg",
      "https://evil.example/upload.wikimedia.org/wikipedia/commons/example/Mixed.jpg",
      "http://upload.wikimedia.org/wikipedia/commons/example/Mixed.jpg",
      "https://user@upload.wikimedia.org/wikipedia/commons/example/Mixed.jpg",
      "https://upload.wikimedia.org:444/wikipedia/commons/example/Mixed.jpg",
      "https://upload.wikimedia.org/wikipedia/other/example/Mixed.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/example/Mixed.jpg#other",
    ]) {
      expect(() => validateExternalFixture(contractFixture({ originalUrl }))).toThrow(/upload\.wikimedia\.org \/wikipedia\/commons/);
    }
  });

  it("accepts only the pinned Apache-2.0 ZXing Android-camera source", () => {
    const revision = "19aa2d8254410e161f04dc3c928e68d5e90233c2";
    const fixture = contractFixture({
      id: "external-zxing-android-camera-pdf417-2-01",
      sourceRepository: "ZXing GitHub",
      sourceRevision: revision,
      sourcePage: `https://github.com/zxing/zxing/blob/${revision}/core/src/test/resources/blackbox/pdf417-2/01.png`,
      originalUrl: `https://raw.githubusercontent.com/zxing/zxing/${revision}/core/src/test/resources/blackbox/pdf417-2/01.png`,
      originalFilename: "01.png",
      cameraProvenanceUrl: "https://github.com/zxing/zxing/commit/f5124cec37e482cc58e6a4c9630e09191a3143e1",
      license: "Apache-2.0",
      licenseUrl: "https://www.apache.org/licenses/LICENSE-2.0",
      licenseEvidenceUrl: `https://github.com/zxing/zxing/blob/${revision}/.reuse/dep5`,
      file: "fixtures/alpha5/external-open-license/pdf417/zxing-android-camera-pdf417-2-01.png",
      sha256: "b036c6b9d6c1d36cc44651975004226fb16b5d1bdded83d6461ef473b3c978f1",
      format: "pdf417",
      formatClass: "stacked",
      expectedFormat: "pdf417",
      expectedPayload: "1234567890",
      expectedResultCount: 1,
      requiredResults: [{ format: "pdf417", payload: "1234567890", isGs1: false }],
      groundTruthReview: {
        method: "upstream-reference-answer",
        reviewer: "Scanly evidence maintainer",
        reviewedAt: "2026-08-09T18:06:46.314Z",
        evidenceUrl: `https://raw.githubusercontent.com/zxing/zxing/${revision}/core/src/test/resources/blackbox/pdf417-2/01.txt`,
        evidenceSha256: "c775e7b757ede630cd0aa1113bd102661ab38829ca52a6422ab782862f268646",
      },
      physicalInstanceCount: 1,
      physicalInstances: [{ format: "pdf417", payload: "1234567890", isGs1: false, count: 1 }],
    });
    expect(() => validateExternalFixture(fixture)).not.toThrow();
    expect(() => validateExternalFixture({ ...fixture, sourceRevision: "0".repeat(40) })).toThrow(/audited revision/);
    expect(() => validateExternalFixture({ ...fixture, id: "external-zxing-android-camera-pdf417-2-99" }))
      .toThrow(/outside the audited three-file camera cohort/);
    expect(() => validateExternalFixture({ ...fixture, originalFilename: "08.png" })).toThrow(/audited fixture identity/);
    expect(() => validateExternalFixture({ ...fixture, sha256: "a".repeat(64) })).toThrow(/audited fixture identity/);
    expect(() => validateExternalFixture({
      ...fixture,
      sourcePage: `https://github.com/zxing/zxing/blob/${revision}/core/src/test/resources/blackbox/pdf417-2/08.png`,
    })).toThrow(/exactly match the audited revision and file/);
    expect(() => validateExternalFixture({
      ...fixture,
      sourcePage: `https://github.com.evil.example/zxing/zxing/blob/${revision}/core/src/test/resources/blackbox/pdf417-2/01.png`,
    })).toThrow(/exactly match the audited revision and file/);
    expect(() => validateExternalFixture({
      ...fixture,
      originalUrl: `https://raw.githubusercontent.com.evil.example/zxing/zxing/${revision}/core/src/test/resources/blackbox/pdf417-2/01.png`,
    })).toThrow(/exactly match the audited revision and file/);
    expect(() => validateExternalFixture({ ...fixture, licenseEvidenceUrl: "https://github.com/zxing/zxing/blob/main/.reuse/dep5" }))
      .toThrow(/coverage evidence/);
    expect(() => validateExternalFixture({ ...fixture, cameraProvenanceUrl: "https://example.test/photo" }))
      .toThrow(/Android-camera provenance/);
    expect(() => validateExternalFixture({
      ...fixture,
      groundTruthReview: { ...fixture.groundTruthReview, evidenceUrl: fixture.originalUrl },
    })).toThrow(/pinned upstream 01\.txt answer URL, SHA-256, and payload/);
    expect(() => validateExternalFixture({
      ...fixture,
      groundTruthReview: { ...fixture.groundTruthReview, evidenceSha256: "a".repeat(64) },
    })).toThrow(/pinned upstream 01\.txt answer URL, SHA-256, and payload/);
    expect(() => validateExternalFixture({
      ...fixture,
      requiredResults: [{ format: "pdf417", payload: "tampered", isGs1: false }],
      physicalInstances: [{ format: "pdf417", payload: "tampered", isGs1: false, count: 1 }],
      expectedPayload: "tampered",
    })).toThrow(/pinned upstream 01\.txt answer URL, SHA-256, and payload/);
    const redistributedLicense = fs.readFileSync(path.join(ROOT, "fixtures/alpha5/external-open-license/pdf417/ZXING-APACHE-2.0.txt"));
    expect(crypto.createHash("sha256").update(redistributedLicense).digest("hex"))
      .toBe("3f62881f0566227a24b12e5a754cc79f39aaa94883038e95c94812e1f50af42f");
  });

  it("treats misses as recall while keeping wrong or extra results blocking", () => {
    const fixtures = (["data_matrix", "pdf417", "code_128", "retail"] as const)
      .flatMap((family) => [1, 2, 3].map((index) => familyFixture(family, index)));
    const misses = new Set(["data_matrix-1", "pdf417-1"]);
    const results: ExternalVerificationResult[] = fixtures.map((fixture) => ({
      id: fixture.id,
      requiredResults: fixture.requiredResults,
      groundTruthReview: fixture.groundTruthReview,
      missingResults: misses.has(fixture.id) ? fixture.requiredResults : [],
      unexpectedResults: [],
    }));
    const evidence = deriveExternalPhotoGate(fixtures, results);
    expect(evidence).toMatchObject({
      photoCount: 12,
      matchedResultCount: 10,
      requiredResultCount: 12,
      overallSemanticRecall: 10 / 12,
      unexpectedResultCount: 0,
      pass: true,
      physicalDeviceEvidence: "unavailable",
      beta1Release: "NO_GO",
    });
    expect(evidence.families.data_matrix.semanticRecall).toBe(2 / 3);
    expect(evidence.families.pdf417.semanticRecall).toBe(2 / 3);

    const withUnexpected = results.map((result) => ({ ...result, unexpectedResults: [...result.unexpectedResults] }));
    withUnexpected[0].unexpectedResults.push({ format: "data_matrix", payload: "WRONG", isGs1: false });
    const failed = deriveExternalPhotoGate(fixtures, withUnexpected);
    expect(failed.pass).toBe(false);
    expect(failed.unexpectedResultCount).toBe(1);
    expect(failed.failureReasons).toContain("unexpected results 1");

    const incomplete = deriveExternalPhotoGate(fixtures, results.slice(1));
    expect(incomplete.pass).toBe(false);
    expect(incomplete.failureReasons).toContain("verification result set does not exactly cover the fixture set");
  });

  it("checks GS1 semantics and derives deduplicated results from visible physical instances", () => {
    const gs1 = contractFixture({
      expectedGs1: true,
      expectedResultCount: 1,
      expectedPayload: "(01)12345678901231",
      requiredResults: [{ format: "code_128", payload: "(01)12345678901231", isGs1: true }],
      physicalInstanceCount: 1,
      physicalInstances: [{ format: "code_128", payload: "(01)12345678901231", isGs1: true, count: 1 }],
    });
    expect(() => validateExternalFixture(gs1)).not.toThrow();
    expect(exactExternalResultMultiset(gs1.requiredResults, [{ format: "code_128", payload: "(01)12345678901231", isGs1: false }])).toBe(false);
    expect(isExternalGs1Misclassification(gs1.requiredResults, { format: "code_128", payload: "(01)12345678901231", isGs1: false })).toBe(true);

    const repeatedPhysical = contractFixture({
      physicalInstanceCount: 3,
      physicalInstances: [
        { format: "code_128", payload: "LOT-123", isGs1: false, count: 1 },
        { format: "ean_13", payload: "5901234123457", isGs1: false, count: 2 },
      ],
    });
    expect(() => validateExternalFixture(repeatedPhysical)).not.toThrow();
    expect(() => validateExternalFixture({ ...repeatedPhysical, physicalInstanceCount: 2 })).toThrow(/physicalInstanceCount must equal/);
  });

  it("rejects duplicate files, identities, sources, and original byte hashes", () => {
    expect(() => validateExternalFixtureSet([contractFixture(), contractFixture({ id: "second", file: "fixtures/alpha5/external-open-license/code128/second.jpg", sourcePage: "https://commons.wikimedia.org/wiki/File:Second.jpg", originalUrl: "https://upload.wikimedia.org/wikipedia/commons/example/Second.jpg", sha256: "b".repeat(64) })])).not.toThrow();
    for (const field of ["id", "file", "sourcePage", "originalUrl", "sha256"] as const) {
      const first = contractFixture();
      const second = contractFixture({ id: "second", file: "fixtures/alpha5/external-open-license/code128/second.jpg", sourcePage: "https://commons.wikimedia.org/wiki/File:Second.jpg", originalUrl: "https://upload.wikimedia.org/wikipedia/commons/example/Second.jpg", sha256: "b".repeat(64), [field]: first[field] });
      expect(() => validateExternalFixtureSet([first, second])).toThrow(new RegExp(`duplicate external fixture ${field}`));
    }
  });

  it("keeps primary aliases compatible while validating every result format and family path", () => {
    expect(() => validateExternalFixture(contractFixture({ expectedPayload: "NOT-IN-GROUND-TRUTH" }))).toThrow(/must identify a required result/);
    expect(() => validateExternalFixture(contractFixture({ format: "ean_13" }))).toThrow(/format must match expectedFormat/);
    expect(() => validateExternalFixture(contractFixture({ formatClass: "matrix" }))).toThrow(/formatClass does not match expectedFormat/);
    expect(() => validateExternalFixture(contractFixture({ file: "fixtures/alpha5/external-open-license/retail/mixed.jpg" }))).toThrow(/outside the expected family directory/);
    expect(() => validateExternalFixture(contractFixture({ file: "fixtures/alpha5/external-open-license/code128/../../project-photos/mixed.jpg" }))).toThrow(/normalized and repository-relative/);
    expect(() => validateExternalFixture(contractFixture({
      requiredResults: [
        { format: "code_128", payload: "LOT-123", isGs1: false },
        { format: "qr_code", payload: "https://example.test", isGs1: false },
      ],
    }))).toThrow(/format is unsupported: qr_code/);
  });

  it("documents the photo, ownership, and physical-device boundary", () => {
    const sentence = "Curated open-license camera photographs satisfy the Beta 1 photo gate but do not constitute physical-camera/device evidence or project ownership.";
    expect(read("docs/history/sdk-v2-development-history.md")).toContain(sentence);
    expect(read("docs/symbologies.md")).toContain(sentence);
    expect(read("docs/benchmarking/methodology.md")).toContain(sentence);
    expect(read("fixtures/alpha5/external-open-license/README.md")).toContain(sentence);
    expect(read("docs/benchmark.md")).toContain("independent physical-camera/device evidence");
  });

  it("keeps every generated mixed fixture genuinely multi-format", () => {
    const manifest = JSON.parse(read("fixtures/alpha5/manifest.json")) as {
      fixtures: Array<{ id: string; sourceType: string; requiredResults: Array<{ format: string; payload: string }> }>;
    };
    const mixed = manifest.fixtures.filter((fixture) => fixture.sourceType === "generated" && fixture.requiredResults.length > 1);
    expect(mixed).toHaveLength(12);
    for (const fixture of mixed) {
      expect(new Set(fixture.requiredResults.map((result) => result.format)).size, fixture.id).toBe(fixture.requiredResults.length);
    }
  });
});
