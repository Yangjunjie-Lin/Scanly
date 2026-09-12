import assert from "node:assert/strict";

const existingNames = ["@scanly/benchmark", "@scanly/browser", "@scanly/core", "@scanly/engine-jsqr", "@scanly/engine-zxing-cpp-wasm", "@scanly/engine-zxing-js", "@scanly/node", "@scanly/parsers", "@scanly/react", "@scanly/scenario-schema"];

/** Preserve normal OIDC policy. The only bootstrap exception is the new 2.1.0
 * URL package, with an authenticated owner, interactive 2FA, and an exact-byte
 * CI-signed provenance bundle. It is never a token-in-CI or provenance waiver. */
export function validateStableNpmCredentials(evidence, version, expectedCount, sourceCommit) {
  assert.equal(evidence?.account, "yangjunjielin");
  assert.equal(evidence?.organization, "scanly");
  assert.equal(evidence?.organizationRole, "owner");
  assert.equal(evidence?.repository, "Yangjunjie-Lin/Scanly");
  assert.equal(evidence?.workflowFile, "stable-npm-publish.yml");
  assert.equal(evidence?.provenanceMechanism, "GITHUB_ACTIONS_OIDC");
  assert.equal(evidence?.secretValueRecorded, false);
  if (!evidence.bootstrap) {
    assert.equal(evidence.trustedPublisherStatus, "AVAILABLE");
    assert.equal(evidence.trustedPublisherPackageCount, expectedCount);
    return "OIDC";
  }
  assert.equal(version, "2.1.0", "The first-publish exception is version-scoped");
  assert.equal(expectedCount, 11);
  assert.equal(evidence.trustedPublisherStatus, "AVAILABLE_WITH_QUALIFIED_BOOTSTRAP");
  assert.equal(evidence.trustedPublisherPackageCount, 10);
  assert.deepEqual([...evidence.trustedPublisherPackages].sort(), existingNames);
  const bootstrap = evidence.bootstrap;
  assert.equal(bootstrap.package, "@scanly/url-safety");
  assert.equal(bootstrap.version, version);
  assert.equal(bootstrap.sourceCommit, sourceCommit);
  assert.equal(bootstrap.method, "INTERACTIVE_NPM_PROVENANCE_FILE");
  assert.equal(bootstrap.cliAuthenticatedAccount, evidence.account);
  assert.equal(bootstrap.interactiveTwoFactorRequired, true);
  assert.equal(bootstrap.npmCredentialSharedWithCI, false);
  assert.equal(bootstrap.provenanceVerified, true);
  assert.equal(bootstrap.signedReleaseTagRequired, true);
  assert.equal(bootstrap.placeholderVersionAllowed, false);
  assert.equal(bootstrap.artifactPath, "release/stable/v2.1.0/artifacts/npm/scanly-url-safety-2.1.0.tgz");
  assert.equal(bootstrap.provenancePath, "release/stable/v2.1.0/artifacts/provenance/scanly-url-safety-2.1.0.tgz.sigstore.json");
  for (const key of ["artifactSha256", "provenanceSha256"]) assert.match(bootstrap[key] ?? "", /^[a-f0-9]{64}$/);
  assert.match(bootstrap.artifactSha512 ?? "", /^[a-f0-9]{128}$/);
  return "OIDC_WITH_INTERACTIVE_FIRST_PACKAGE";
}
