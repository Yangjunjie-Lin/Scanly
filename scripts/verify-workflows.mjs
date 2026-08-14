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

console.log(`Verified YAML syntax for ${workflowFiles.length} GitHub Actions workflows.`);
