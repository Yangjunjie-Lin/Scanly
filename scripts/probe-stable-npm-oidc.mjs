import assert from "node:assert/strict";
import fs from "node:fs";

assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.GITHUB_REPOSITORY, "Yangjunjie-Lin/Scanly");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
assert.ok(process.env.GITHUB_WORKFLOW_REF?.startsWith("Yangjunjie-Lin/Scanly/.github/workflows/stable-npm-publish.yml@"));
assert.ok(!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN, "No stored npm credentials are permitted");
const names = ["@scanly/parsers", "@scanly/scenario-schema", "@scanly/benchmark", "@scanly/core", "@scanly/engine-jsqr", "@scanly/engine-zxing-js", "@scanly/engine-zxing-cpp-wasm", "@scanly/browser", "@scanly/node", "@scanly/react", "@scanly/url-safety"];
const tokenUrl = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
tokenUrl.searchParams.set("audience", "npm:registry.npmjs.org");
const identityResponse = await fetch(tokenUrl, { headers: { Authorization: `Bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
assert.ok(identityResponse.ok, "GitHub OIDC identity request failed");
const identity = await identityResponse.json();
assert.ok(typeof identity.value === "string", "GitHub OIDC identity missing");
const results = [];
for (const name of names) {
  // This is the same official exchange used by npm's OIDC authentication.
  // Returned credentials remain in memory and are never logged or persisted.
  const response = await fetch(`https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/${encodeURIComponent(name)}`, { method: "POST", headers: { Authorization: `Bearer ${identity.value}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({}));
  const accepted = response.ok && typeof body.token === "string" && body.token.length > 0;
  results.push({ package: name, status: accepted ? "OIDC_TOKEN_EXCHANGE_ACCEPTED" : name === "@scanly/url-safety" && response.status === 404 ? "FIRST_PUBLICATION_BOOTSTRAP_REQUIRED" : "UNAVAILABLE", httpStatus: response.status, credentialRecorded: false });
  console.log(`${name}: ${results.at(-1).status} (HTTP ${response.status})`);
}
const report = { schemaVersion: "scanly-npm-oidc-qualification-1", checkedAt: new Date().toISOString(), repository: process.env.GITHUB_REPOSITORY, workflowFile: "stable-npm-publish.yml", workflowRef: process.env.GITHUB_WORKFLOW_REF, workflowDefinitionCommit: process.env.GITHUB_SHA, runId: Number(process.env.GITHUB_RUN_ID), runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT), storedNpmCredentialsUsed: false, credentialsRecorded: false, configurationModified: false, packagesPublished: [], results, existingTenAccepted: results.slice(0, 10).every((item) => item.status === "OIDC_TOKEN_EXCHANGE_ACCEPTED"), limitation: "Exchange acceptance proves the matching existing trusted identity can obtain a short-lived npm credential. Final package publication and provenance still require separate verification." };
fs.mkdirSync("release-dist", { recursive: true });
fs.writeFileSync("release-dist/npm-oidc-qualification.json", JSON.stringify(report, null, 2) + "\n");
assert.ok(report.existingTenAccepted, "Existing trusted publisher qualification failed");
