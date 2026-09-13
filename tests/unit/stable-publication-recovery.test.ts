import { describe, expect, it } from "vitest";
import fs from "node:fs";
import crypto from "node:crypto";
// @ts-expect-error release-only MJS has no SDK declaration
import { verifyPublicationRecovery } from "../../scripts/stable-publication-recovery.mjs";

const root = "release/stable/v2.1.0";
const publication = () => JSON.parse(fs.readFileSync(`${root}/v2.1.0-publication-record.json`, "utf8"));
const qualification = JSON.parse(fs.readFileSync(`${root}/v2.1.0-manifest.json`, "utf8"));
const readBytes = (file: string) => fs.readFileSync(file);

describe("immutable publication provenance recovery reference", () => {
  it("verifies the actual additive record without rewriting it", () => {
    expect(() => verifyPublicationRecovery(publication(), qualification, readBytes)).not.toThrow();
  });
  it.each(["2.0.0", "2.0.1"])("retains historical %s verification without requiring a new record", (version) => {
    expect(() => verifyPublicationRecovery({ version }, {}, () => { throw new Error("unexpected read"); })).not.toThrow();
  });
  it("fails if the recovery reference or file is missing", () => {
    const record = publication(); delete record.provenanceRecovery;
    expect(() => verifyPublicationRecovery(record, qualification, readBytes)).toThrow();
    expect(() => verifyPublicationRecovery(publication(), qualification, () => { throw new Error("ENOENT"); })).toThrow();
  });
  it.each(["path", "sha256", "runId"])("rejects a substituted reference %s", (field) => {
    const record = publication(); record.provenanceRecovery[field] = field === "runId" ? 1 : "substituted";
    expect(() => verifyPublicationRecovery(record, qualification, readBytes)).toThrow();
  });
  it("rejects changed bytes even if JSON remains valid", () => {
    expect(() => verifyPublicationRecovery(publication(), qualification, (file: string) => Buffer.concat([readBytes(file), Buffer.from(" ")]))).toThrow(/SHA-256/);
  });
  it.each(["schemaVersion", "version", "package", "sourceCommit", "runId", "runAttempt"])("validates recovery %s independently of its digest", (field) => {
    const record = publication(); const recovery = JSON.parse(readBytes(record.provenanceRecovery.path).toString());
    recovery[field] = field.startsWith("run") ? -1 : "substituted";
    const bytes = Buffer.from(JSON.stringify(recovery)); record.provenanceRecovery.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    expect(() => verifyPublicationRecovery(record, qualification, () => bytes)).toThrow();
  });
  it("binds the correction to the published URL Safety attestation", () => {
    const record = publication(); record.npm.find((entry: { name: string }) => entry.name === "@scanly/url-safety").provenanceIdentity.invocationId = "substituted";
    expect(() => verifyPublicationRecovery(record, qualification, readBytes)).toThrow();
  });
  it("rejects changes or deletion of any referenced proof", () => {
    expect(() => verifyPublicationRecovery(publication(), qualification, (file: string) => file.includes("provenance-B/") ? Buffer.from("changed") : readBytes(file))).toThrow(/evidence changed/);
    expect(() => verifyPublicationRecovery(publication(), qualification, (file: string) => { if (file.includes("provenance-A/")) throw new Error("ENOENT"); return readBytes(file); })).toThrow();
  });
  it("rejects an evidence reference outside the versioned recovery directory", () => {
    const record = publication(); const recovery = JSON.parse(readBytes(record.provenanceRecovery.path).toString());
    recovery.evidence[0].path = "release/stable/v2.1.0/publication-recovery/../../outside.json";
    const bytes = Buffer.from(JSON.stringify(recovery)); record.provenanceRecovery.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    expect(() => verifyPublicationRecovery(record, qualification, (file: string) => file === record.provenanceRecovery.path ? bytes : readBytes(file))).toThrow(/Unsafe/);
  });
  it("triggers real artifact qualification for helper-only changes on both maintained branches", () => {
    const workflow = fs.readFileSync(".github/workflows/v2.1-artifact-qualification.yml", "utf8");
    const pullRequest = workflow.split("  pull_request:")[1].split("  workflow_dispatch:")[0];
    expect(pullRequest).toContain("branches: [develop, main]");
    expect(pullRequest).toContain("- scripts/npm-provenance-identity.mjs");
  });
});
