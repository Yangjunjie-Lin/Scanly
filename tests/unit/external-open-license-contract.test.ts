import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXTERNAL_PROVENANCE_NOTE,
  diffExternalResultMultiset,
  exactExternalResultMultiset,
  isExternalFormatMisclassification,
  isExternalGs1Misclassification,
  validateExternalFixture,
  validateExternalFixtureSet,
  type ExternalFixture,
} from "../../scripts/external-open-license-contract";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

const contractFixture = (overrides: Partial<ExternalFixture> = {}): ExternalFixture => ({
  id: "external-mixed-contract",
  file: "fixtures/alpha5/external-open-license/code128/mixed.jpg",
  format: "code_128",
  formatClass: "linear",
  sourceType: "external-open-license",
  sourceRepository: "Wikimedia Commons",
  sourcePage: "https://commons.wikimedia.org/wiki/File:Mixed.jpg",
  originalFilename: "Mixed.jpg",
  author: "Example Author",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
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
});

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
        sourceRepository: "Wikimedia Commons",
        publicRepositorySafe: true,
        provenanceNote: "Third-party open-license real-world photograph; not project-owned.",
      });
      for (const key of ["sourcePage", "originalFilename", "author", "license", "licenseUrl", "attribution", "retrievedAt", "expectedFormat"]) {
        expect(typeof fixture[key], key).toBe("string");
        expect((fixture[key] as string).length, key).toBeGreaterThan(0);
      }
      expect(Array.isArray(fixture.modifications)).toBe(true);
      expect(fixture.payloadVerificationStatus).not.toBe("sensitive");
      if (fixture.payloadVerificationStatus === "unknown") expect(fixture.expectedPayload).toBeNull();
      expect(fixture.expectedOutcome).toBe("decode");
      expect(Array.isArray(fixture.requiredResults)).toBe(true);
      expect((fixture.requiredResults as unknown[]).length).toBeGreaterThan(0);
      expect(fixture.expectedResultCount).toBe((fixture.requiredResults as unknown[]).length);
      expect(() => validateExternalFixture(fixture as unknown as ExternalFixture)).not.toThrow();
      const bytes = fs.readFileSync(path.join(ROOT, fixture.file as string));
      expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
    }
  });

  it("keeps the tracked WASM validation report aligned with manifest Ground Truth", () => {
    const manifestText = read("fixtures/alpha5/external-open-license/manifest.json");
    const manifest = JSON.parse(manifestText) as {
      fixtures: Array<{ id: string; requiredResults: unknown[]; physicalInstanceCount: number }>;
    };
    const report = JSON.parse(read("fixtures/alpha5/external-open-license/validation-report.json")) as {
      manifestSha256: string;
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
      projectOwnedRealPhotos: number;
      projectOwnedRealPhotoCountGate: boolean;
      externalOpenLicenseCorpusCount: number;
      externalOpenLicenseGate: boolean;
      results: Array<{ id: string; passed: boolean }>;
    };
    const projectPhotos = JSON.parse(read("fixtures/alpha5/project-photos/manifest.json")) as { fixtures: Array<{ sourceType: string }> };
    const projectOwnedRealPhotos = projectPhotos.fixtures.filter((fixture) => fixture.sourceType === "project-photo").length;
    const expectedResults = manifest.fixtures.reduce((count, fixture) => count + fixture.requiredResults.length, 0);
    const visiblePhysicalInstances = manifest.fixtures.reduce((count, fixture) => count + fixture.physicalInstanceCount, 0);
    const sdkVersion = (JSON.parse(read("package.json")) as { version: string }).version;
    expect(report).toMatchObject({
      status: "PASS_EXTERNAL_OPEN_LICENSE",
      manifestSha256: crypto.createHash("sha256").update(manifestText.replaceAll("\r\n", "\n")).digest("hex"),
      sdkVersion,
      engine: { id: "zxing-cpp-wasm", version: "3.1.1+zxing-cpp.6c2961d" },
      fixtureCount: manifest.fixtures.length,
      requiredResultCount: expectedResults,
      exactResultCount: expectedResults,
      visiblePhysicalInstanceCount: visiblePhysicalInstances,
      observedResultCount: expectedResults,
      falsePositiveCount: 0,
      formatMisclassificationCount: 0,
      gs1MisclassificationCount: 0,
      projectOwnedRealPhotos,
      projectOwnedRealPhotoCountGate: projectOwnedRealPhotos >= 12,
      externalOpenLicenseCorpusCount: manifest.fixtures.length,
      externalOpenLicenseGate: true,
    });
    expect(report.results.every((result) => result.passed)).toBe(true);
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
    expect(() => validateExternalFixture(contractFixture({ requiredResults: [] }))).toThrow(/requiredResults must contain independent ground truth/);
    expect(() => validateExternalFixture(contractFixture({ expectedResultCount: 1 }))).toThrow(/expectedResultCount must equal requiredResults length/);
    expect(() => validateExternalFixture(contractFixture({ expectedOutcome: "no-symbol" } as unknown as Partial<ExternalFixture>))).toThrow(/expectedOutcome must be decode/);
    expect(() => validateExternalFixture(contractFixture({ payloadVerificationStatus: "unknown", expectedPayload: null }))).toThrow(/unknown payloads must not be guessed or admitted/);
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
    expect(() => validateExternalFixtureSet([contractFixture(), contractFixture({ id: "second", file: "fixtures/alpha5/external-open-license/code128/second.jpg", sourcePage: "https://commons.wikimedia.org/wiki/File:Second.jpg", sha256: "b".repeat(64) })])).not.toThrow();
    for (const field of ["id", "file", "sourcePage", "sha256"] as const) {
      const first = contractFixture();
      const second = contractFixture({ id: "second", file: "fixtures/alpha5/external-open-license/code128/second.jpg", sourcePage: "https://commons.wikimedia.org/wiki/File:Second.jpg", sha256: "b".repeat(64), [field]: first[field] });
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

  it("documents the exact project-owned gate disclaimer", () => {
    const sentence = "External open-license photographs provide third-party real-world validation but do not satisfy the project-owned photograph release gate.";
    expect(read("README.md")).toContain(sentence);
    expect(read("docs/symbologies.md")).toContain(sentence);
    expect(read("docs/benchmarking/methodology.md")).toContain(sentence);
    expect(read("fixtures/alpha5/external-open-license/README.md")).toContain(sentence);
    expect(read("docs/benchmark.md")).toContain("BLOCKED_REAL_PHOTO_INPUT");
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
