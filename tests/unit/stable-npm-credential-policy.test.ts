import { describe, expect, it } from "vitest";
import fs from "node:fs";
// JavaScript release tooling is deliberately independent of the SDK bundle.
// @ts-expect-error release MJS has no TypeScript declaration entry
import { validateStableNpmCredentials } from "../../scripts/stable-npm-credential-policy.mjs";

const base = { account: "yangjunjielin", organization: "scanly", organizationRole: "owner", repository: "Yangjunjie-Lin/Scanly", workflowFile: "stable-npm-publish.yml", provenanceMechanism: "GITHUB_ACTIONS_OIDC", secretValueRecorded: false, trustedPublisherStatus: "AVAILABLE", trustedPublisherPackageCount: 11 };
const source = "a".repeat(40);
const bootstrap = () => ({ ...base, trustedPublisherStatus: "AVAILABLE_WITH_QUALIFIED_BOOTSTRAP", trustedPublisherPackageCount: 10, trustedPublisherPackages: ["@scanly/benchmark", "@scanly/browser", "@scanly/core", "@scanly/engine-jsqr", "@scanly/engine-zxing-cpp-wasm", "@scanly/engine-zxing-js", "@scanly/node", "@scanly/parsers", "@scanly/react", "@scanly/scenario-schema"], bootstrap: { package: "@scanly/url-safety", version: "2.1.0", sourceCommit: source, method: "INTERACTIVE_NPM_PROVENANCE_FILE", cliAuthenticatedAccount: "yangjunjielin", interactiveTwoFactorRequired: true, npmCredentialSharedWithCI: false, provenanceVerified: true, signedReleaseTagRequired: true, placeholderVersionAllowed: false, artifactPath: "release/stable/v2.1.0/artifacts/npm/scanly-url-safety-2.1.0.tgz", provenancePath: "release/stable/v2.1.0/artifacts/provenance/scanly-url-safety-2.1.0.tgz.sigstore.json", artifactSha256: "b".repeat(64), provenanceSha256: "c".repeat(64), artifactSha512: "d".repeat(128) } });
describe("version-scoped first-publication credential policy", () => {
  it("requires an actual release event and independently prevents publication in qualification-only mode", () => {
    const workflow = fs.readFileSync(".github/workflows/stable-npm-publish.yml", "utf8");
    expect(workflow).toContain("github.event_name == 'release' && github.event.release.prerelease == false");
    expect(workflow).toContain('run: test "$QUALIFY_ONLY" != "true"');
    expect(workflow.indexOf("Assert publication mode")).toBeLessThan(workflow.indexOf("name: Resolve and verify signed Stable release identity"));
  });
  it("preserves normal and historical OIDC checks", () => {
    expect(validateStableNpmCredentials(base, "2.1.0", 11, source)).toBe("OIDC");
    expect(validateStableNpmCredentials({ ...base, trustedPublisherPackageCount: 10 }, "2.0.1", 10, source)).toBe("OIDC");
    expect(() => validateStableNpmCredentials({ ...base, trustedPublisherPackageCount: 10 }, "2.1.0", 11, source)).toThrow();
  });
  it("allows only the exact new package with signed provenance and interactive 2FA", () => {
    expect(validateStableNpmCredentials(bootstrap(), "2.1.0", 11, source)).toBe("OIDC_WITH_INTERACTIVE_FIRST_PACKAGE");
    expect(() => validateStableNpmCredentials(bootstrap(), "2.0.1", 10, source)).toThrow();
  });
  it.each(["package", "version", "sourceCommit", "method", "cliAuthenticatedAccount", "artifactPath", "provenancePath", "artifactSha256", "artifactSha512", "provenanceSha256"])("rejects substituted %s", (field) => {
    const value = bootstrap();
    Object.assign(value.bootstrap, { [field]: "substituted" });
    expect(() => validateStableNpmCredentials(value, "2.1.0", 11, source)).toThrow();
  });
  it.each(["interactiveTwoFactorRequired", "provenanceVerified", "signedReleaseTagRequired"])("cannot waive %s", (field) => {
    const value = bootstrap(); Object.assign(value.bootstrap, { [field]: false });
    expect(() => validateStableNpmCredentials(value, "2.1.0", 11, source)).toThrow();
  });
  it.each(["npmCredentialSharedWithCI", "placeholderVersionAllowed"])("forbids %s", (field) => {
    const value = bootstrap(); Object.assign(value.bootstrap, { [field]: true });
    expect(() => validateStableNpmCredentials(value, "2.1.0", 11, source)).toThrow();
  });
  it("rejects unverified or mismatched remaining package publishers", () => {
    const value = bootstrap(); value.trustedPublisherPackages.pop();
    expect(() => validateStableNpmCredentials(value, "2.1.0", 11, source)).toThrow();
    expect(() => validateStableNpmCredentials({ ...base, secretValueRecorded: true }, "2.1.0", 11, source)).toThrow();
  });
});
