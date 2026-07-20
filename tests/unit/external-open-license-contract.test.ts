import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("external open-license Alpha.5 cohort", () => {
  it("keeps third-party photographs separate from project-owned evidence", () => {
    const external = JSON.parse(read("fixtures/alpha5/external-open-license/manifest.json")) as { fixtures: Array<Record<string, unknown>> };
    const project = JSON.parse(read("fixtures/alpha5/project-photos/manifest.json")) as { fixtures: Array<Record<string, unknown>> };
    expect(project.fixtures).toEqual([]);
    expect(external.fixtures.every((fixture) => fixture.sourceType === "external-open-license")).toBe(true);
    expect(external.fixtures.every((fixture) => fixture.sourceType !== "project-photo")).toBe(true);
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
      const bytes = fs.readFileSync(path.join(ROOT, fixture.file as string));
      expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(fixture.sha256);
    }
  });

  it("documents the exact project-owned gate disclaimer", () => {
    const sentence = "External open-license photographs provide third-party real-world validation but do not satisfy the project-owned photograph release gate.";
    expect(read("README.md")).toContain(sentence);
    expect(read("docs/symbologies.md")).toContain(sentence);
    expect(read("docs/benchmarking/methodology.md")).toContain(sentence);
    expect(read("fixtures/alpha5/external-open-license/README.md")).toContain(sentence);
    expect(read("docs/benchmark.md")).toContain("BLOCKED_REAL_PHOTO_INPUT");
  });
});
