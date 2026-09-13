import assert from "node:assert/strict";

const repository = "https://github.com/Yangjunjie-Lin/Scanly";
const workflowPath = ".github/workflows/v2.1-artifact-qualification.yml";

// npm Registry binds dependency zero to the GitHub OIDC certificate, not to
// an independently checked-out product. Keep both identities without spoofing
// the runner environment or replacing the actual product-source dependency.
export function npmBuildDependencies(sourceCommit, workflowCommit, workflowRef) {
  for (const commit of [sourceCommit, workflowCommit]) assert.match(commit ?? "", /^[a-f0-9]{40}$/);
  assert.match(workflowRef ?? "", /^refs\/(heads|tags|pull)\//);
  return [
    { uri: `git+${repository}@${workflowRef}`, digest: { gitCommit: workflowCommit } },
    { uri: `git+${repository}@${sourceCommit}`, digest: { gitCommit: sourceCommit } },
  ];
}

export function validateNpmBuildIdentity(statement, { sourceCommit, workflowCommit, workflowRef }) {
  assert.equal(statement._type, "https://in-toto.io/Statement/v1");
  assert.equal(statement.predicateType, "https://slsa.dev/provenance/v1");
  const definition = statement.predicate.buildDefinition;
  assert.equal(definition.buildType, "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1");
  assert.deepEqual(definition.externalParameters.workflow, { ref: workflowRef, repository, path: workflowPath });
  assert.equal(definition.externalParameters.source_commit, sourceCommit);
  assert.deepEqual(definition.resolvedDependencies, npmBuildDependencies(sourceCommit, workflowCommit, workflowRef));
  assert.equal(statement.predicate.runDetails.builder.id, "https://github.com/actions/runner/github-hosted");
}
