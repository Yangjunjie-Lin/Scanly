import { describe, expect, it } from "vitest";
// @ts-expect-error release MJS is not part of the SDK declarations
import { npmBuildDependencies, validateNpmBuildIdentity } from "../../scripts/npm-provenance-identity.mjs";

const sourceCommit = "a".repeat(40), workflowCommit = "b".repeat(40), workflowRef = "refs/heads/codex/recovery";
const identity = { sourceCommit, workflowCommit, workflowRef };
const makeStatement = () => ({
  _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
  predicate: {
    buildDefinition: {
      buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
      externalParameters: { source_commit: sourceCommit, workflow: { ref: workflowRef, repository: "https://github.com/Yangjunjie-Lin/Scanly", path: ".github/workflows/v2.1-artifact-qualification.yml" } },
      resolvedDependencies: npmBuildDependencies(sourceCommit, workflowCommit, workflowRef),
    },
    runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" } },
  },
});
describe("npm Registry provenance source identity", () => {
  it("binds dependency zero to the certificate source while retaining the exact product source", () => {
    const statement = makeStatement();
    expect(statement.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit).toBe(workflowCommit);
    expect(statement.predicate.buildDefinition.resolvedDependencies[1].digest.gitCommit).toBe(sourceCommit);
    expect(() => validateNpmBuildIdentity(statement, identity)).not.toThrow();
  });
  it("rejects the originally registry-rejected dependency order", () => {
    const statement = makeStatement(); statement.predicate.buildDefinition.resolvedDependencies.reverse();
    expect(() => validateNpmBuildIdentity(statement, identity)).toThrow();
  });
  it.each(["sourceCommit", "workflowCommit", "workflowRef"])("rejects a substituted %s", (key) => {
    expect(() => validateNpmBuildIdentity(makeStatement(), { ...identity, [key]: key === "workflowRef" ? "refs/heads/main" : "c".repeat(40) })).toThrow();
  });
  it("rejects missing actual product evidence and non-GitHub hosted builders", () => {
    const statement = makeStatement(); statement.predicate.buildDefinition.resolvedDependencies.pop();
    expect(() => validateNpmBuildIdentity(statement, identity)).toThrow();
    const other = makeStatement(); other.predicate.runDetails.builder.id = "self-hosted";
    expect(() => validateNpmBuildIdentity(other, identity)).toThrow();
  });
});
