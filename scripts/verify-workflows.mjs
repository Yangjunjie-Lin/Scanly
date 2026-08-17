import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const workflowDirectory = path.resolve(".github", "workflows");
const workflowFiles = fs.readdirSync(workflowDirectory)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .sort();
const parsedWorkflows = new Map();

for (const file of workflowFiles) {
  const filePath = path.join(workflowDirectory, file);
  try {
    const document = yaml.load(fs.readFileSync(filePath, "utf8"));
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      throw new Error("workflow root must be a mapping");
    }
    parsedWorkflows.set(file, document);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid GitHub Actions workflow '${file}': ${detail}`);
  }
}

const primary = ["ci.yml", "benchmark.yml", "browser-benchmark.yml", "public-api.yml", "tracking-benchmark.yml", "industrial-benchmark.yml", "device-evidence-validation.yml", "native-mobile.yml"];
const deletedAlphaBranches = [
  "architecture/sdk-v2-alpha3-industrial-validation",
  "architecture/sdk-v2-alpha4-zxing-cpp-wasm",
  "architecture/sdk-v2-alpha5-multisymbology-foundation",
];
for (const file of primary) {
  const document = parsedWorkflows.get(file);
  const triggers = document?.on;
  if (!triggers || typeof triggers !== "object") throw new Error(`${file}: on must be an event mapping.`);
  for (const event of ["workflow_dispatch", "pull_request", "push"]) {
    if (!Object.prototype.hasOwnProperty.call(triggers, event)) throw new Error(`${file}: missing ${event} trigger.`);
  }
  const pullBranches = triggers.pull_request?.branches ?? [];
  const pushBranches = triggers.push?.branches ?? [];
  if (!pullBranches.includes("develop/sdk-v2")) throw new Error(`${file}: pull requests must target develop/sdk-v2.`);
  if (!pushBranches.includes("develop/sdk-v2") || !pushBranches.includes("architecture/sdk-v2-beta5-**")) {
    throw new Error(`${file}: push routing must include develop/sdk-v2 and architecture/sdk-v2-beta5-**.`);
  }
  for (const deleted of deletedAlphaBranches) {
    if (pushBranches.includes(deleted)) throw new Error(`${file}: deleted Alpha branch remains a push target: ${deleted}.`);
  }
}

const nativeWorkflow = parsedWorkflows.get("native-mobile.yml");
const nativeJobNames = Object.values(nativeWorkflow?.jobs ?? {}).map((job) => job?.name);
for (const required of ["Native Core", "iOS SDK", "Android SDK", "Native Fixture Parity", "Native Memory", "Native Artifact Validation"]) {
  if (!nativeJobNames.includes(required)) throw new Error(`native-mobile.yml: missing required job '${required}'.`);
}

const fullBenchmark = parsedWorkflows.get("benchmark.yml");
const gateInput = fullBenchmark?.on?.workflow_dispatch?.inputs?.gate_mode;
if (gateInput?.default !== "integration" || !gateInput?.options?.includes("release")) {
  throw new Error("benchmark.yml: manual gate_mode must default to integration and retain explicit release mode.");
}

for (const file of ["rc-manifest-integrity.yml", "rc-evidence-assemble.yml", "rc-artifact-build.yml", "stable-release-gate.yml"]) {
  if (!parsedWorkflows.has(file)) throw new Error(`Missing release-integrity workflow '${file}'.`);
  const source = fs.readFileSync(path.join(workflowDirectory, file), "utf8");
  if (file === "stable-release-gate.yml") {
    if (!source.includes("stable:manifest:verify")) throw new Error(`${file}: missing Stable Manifest verifier gate.`);
  } else if (!source.includes("rc:manifest:verify")) throw new Error(`${file}: missing detached Manifest verifier gate.`);
  if (!source.includes("fetch-depth: 0")) throw new Error(`${file}: release integrity requires full Git history and tags.`);
}

const manifestIntegrityWorkflow = fs.readFileSync(path.join(workflowDirectory, "rc-manifest-integrity.yml"), "utf8");
for (const file of ["rc-manifest-integrity.yml", "rc-artifact-build.yml"]) {
  const pushBranches = parsedWorkflows.get(file)?.on?.push?.branches ?? [];
  if (!pushBranches.includes("develop/sdk-v2") || !pushBranches.includes("release/sdk-v2-rc2-final-validation")) {
    throw new Error(`${file}: post-merge develop and exact Candidate push gates are both required.`);
  }
}
for (const legacy of ["release/rc1/rc1-candidate-manifest.json", "release/rc2/rc2-candidate-manifest.json"]) {
  if (!manifestIntegrityWorkflow.includes(legacy)) throw new Error(`rc-manifest-integrity.yml: missing explicit legacy classification for ${legacy}.`);
}
if (!manifestIntegrityWorkflow.includes("--require-exact-candidate-head") || !manifestIntegrityWorkflow.includes("github.ref_name == 'release/sdk-v2-rc2-final-validation'")) {
  throw new Error("rc-manifest-integrity.yml: RC Candidate refs must enforce exact Candidate tag binding.");
}
const evidenceAssemblyWorkflow = fs.readFileSync(path.join(workflowDirectory, "rc-evidence-assemble.yml"), "utf8");
if (evidenceAssemblyWorkflow.includes("rc2-candidate-manifest.template.json") || evidenceAssemblyWorkflow.includes("cp release/rc2/rc2-candidate-manifest")) {
  throw new Error("rc-evidence-assemble.yml: historical Manifest rewrite remains present.");
}
for (const command of ["npm run rc:sbom -- --verify", "npm run rc:repro -- --output=${{ runner.temp }}/rc2-reproducibility.json"]) {
  if (!evidenceAssemblyWorkflow.includes(command)) throw new Error(`rc-evidence-assemble.yml: missing non-mutating frozen evidence check '${command}'.`);
}
if ((evidenceAssemblyWorkflow.match(/--require-exact-candidate-head/g) ?? []).length !== 2) {
  throw new Error("rc-evidence-assemble.yml: both frozen Candidate verification passes must enforce exact tag binding.");
}
const artifactBuildWorkflow = fs.readFileSync(path.join(workflowDirectory, "rc-artifact-build.yml"), "utf8");
if (!artifactBuildWorkflow.includes("rc:artifacts:verify-canonical") || !artifactBuildWorkflow.includes("RC2_ARTIFACT_ROOT: ${{ runner.temp }}/rc2-artifacts")) {
  throw new Error("rc-artifact-build.yml: isolated rebuild lacks canonical package-content equivalence verification.");
}
if (!artifactBuildWorkflow.includes("--require-exact-candidate-head") || !artifactBuildWorkflow.includes("github.ref_name == 'release/sdk-v2-rc2-final-validation'")) {
  throw new Error("rc-artifact-build.yml: RC Candidate refs must enforce exact Candidate tag binding.");
}
const artifactBuildDocument = parsedWorkflows.get("rc-artifact-build.yml");
const artifactNpmJob = artifactBuildDocument?.jobs?.npm;
if (Object.values(artifactNpmJob?.env ?? {}).some((value) => String(value).includes("runner.temp"))) {
  throw new Error("rc-artifact-build.yml: runner context cannot be referenced from job-level env before runner allocation.");
}
const artifactSteps = artifactNpmJob?.steps ?? [];
const requiredTemporaryStepEnvironment = new Map([
  ["Pack public packages", { RC2_ARTIFACT_ROOT: "${{ runner.temp }}/rc2-artifacts" }],
  ["Record isolated CI rebuild identities without rewriting frozen evidence", {
    RC2_ARTIFACT_ROOT: "${{ runner.temp }}/rc2-artifacts",
    RC2_ARTIFACT_MANIFEST_OUTPUT: "${{ runner.temp }}/rc2-artifact-rebuild-manifest.json",
  }],
  ["Verify cross-platform canonical package-content equivalence", { RC2_ARTIFACT_ROOT: "${{ runner.temp }}/rc2-artifacts" }],
]);
for (const [stepName, expectedEnvironment] of requiredTemporaryStepEnvironment) {
  const step = artifactSteps.find((candidate) => candidate?.name === stepName);
  if (!step) throw new Error(`rc-artifact-build.yml: missing '${stepName}' step.`);
  for (const [name, value] of Object.entries(expectedEnvironment)) {
    if (step.env?.[name] !== value) throw new Error(`rc-artifact-build.yml: '${stepName}' must define step-level ${name}.`);
  }
}
const stableReleaseWorkflow = fs.readFileSync(path.join(workflowDirectory, "stable-release-gate.yml"), "utf8");
if (!stableReleaseWorkflow.includes("stable:manifest:verify") || !stableReleaseWorkflow.includes("--require-go") || !stableReleaseWorkflow.includes("POST_RELEASE_VALIDATION") || stableReleaseWorkflow.includes("device:evidence:verify") || stableReleaseWorkflow.includes("--require-exact-candidate-head")) {
  throw new Error("stable-release-gate.yml: Stable Manifest policy and post-release Physical status gates are incomplete.");
}

console.log(`Verified YAML syntax for ${workflowFiles.length} GitHub Actions workflows.`);
