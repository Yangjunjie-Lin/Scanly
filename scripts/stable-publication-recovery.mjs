import assert from "node:assert/strict";
import crypto from "node:crypto";

// Offline, content-addressed verification of the additive Registry correction.
// Historical releases without a correction retain their original checks.
export function verifyPublicationRecovery(record, qualification, readBytes) {
  if (record.version !== "2.1.0" && record.provenanceRecovery === undefined) return;
  assert.equal(record.version, "2.1.0", "Unsupported provenance recovery version");
  const reference = record.provenanceRecovery;
  assert.ok(reference, "v2.1.0 publication requires its additive provenance recovery");
  const expectedPath = "release/stable/v2.1.0/v2.1.0-provenance-recovery.json";
  assert.equal(reference.path, expectedPath, "Recovery reference must use the versioned repository path");
  assert.match(reference.sha256 ?? "", /^[a-f0-9]{64}$/);
  const bytes = readBytes(expectedPath);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), reference.sha256, "Recovery file SHA-256 changed");
  const recovery = JSON.parse(bytes.toString("utf8"));
  assert.equal(recovery.schemaVersion, "scanly-v2.1-provenance-recovery-1");
  assert.equal(recovery.version, record.version);
  assert.equal(recovery.package, "@scanly/url-safety");
  assert.equal(recovery.sourceCommit, qualification.identity.productSourceCommit);
  assert.deepEqual(recovery.qualificationManifest, record.qualificationManifest);
  assert.ok(Number.isSafeInteger(reference.runId) && reference.runId > 0, "Recovery run ID must be a positive integer");
  assert.equal(recovery.runId, reference.runId, "Recovery run ID changed");
  assert.ok(Number.isSafeInteger(recovery.runAttempt) && recovery.runAttempt > 0);
  const publication = record.npm.find((entry) => entry.name === recovery.package);
  assert.equal(publication?.provenanceIdentity?.invocationId, `https://github.com/Yangjunjie-Lin/Scanly/actions/runs/${reference.runId}/attempts/${recovery.runAttempt}`, "Published provenance does not identify the recovery run");
  assert.equal(recovery.npmCredentialsUsedByCI, false);
  assert.ok(Array.isArray(recovery.evidence) && recovery.evidence.length === 26, "Recovery must retain both build reports, 22 proofs, workflow evidence and reproducibility report");
  const seen = new Set();
  for (const evidence of recovery.evidence) {
    assert.ok(typeof evidence.path === "string" && evidence.path.startsWith("release/stable/v2.1.0/publication-recovery/") && !evidence.path.includes("..") && !evidence.path.includes("\\"), "Unsafe recovery evidence path");
    assert.ok(!seen.has(evidence.path), "Duplicate recovery evidence"); seen.add(evidence.path);
    assert.match(evidence.sha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(crypto.createHash("sha256").update(readBytes(evidence.path)).digest("hex"), evidence.sha256, `Recovery evidence changed: ${evidence.path}`);
  }
  assert.ok(recovery.evidence.some((entry) => entry.path === recovery.replacementProvenance?.path && entry.sha256 === recovery.replacementProvenance.sha256), "Replacement provenance must be covered by the verified evidence set");
}
