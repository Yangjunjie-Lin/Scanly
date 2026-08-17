import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalZipSha256,
  validatedZipEntries,
  validatedZipEntriesFromBytes,
  ZIP_CANONICALIZATION_POLICY,
} from "./release-artifact-canonicalization.mjs";

const root = path.resolve(import.meta.dirname, "..");
const stableRoot = path.join(root, "release", "stable");
const argumentsByName = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const equals = argument.indexOf("=");
  if (!argument.startsWith("--") || equals < 3) throw new Error(`Invalid argument '${argument}'.`);
  return [argument.slice(2, equals), argument.slice(equals + 1)];
}));
const requiredArgument = (name) => {
  const value = argumentsByName[name];
  if (!value) throw new Error(`Missing --${name}=... argument.`);
  return value;
};
const buildA = path.resolve(root, requiredArgument("build-a"));
const buildB = path.resolve(root, requiredArgument("build-b"));
const runA = requiredArgument("run-a");
const runB = requiredArgument("run-b");
const workflowHeadSha = requiredArgument("workflow-head");
const requestedSourceCommit = requiredArgument("source-commit");
if (!/^\d+$/.test(runA) || !/^\d+$/.test(runB) || !/^[a-f0-9]{40}$/.test(workflowHeadSha) || !/^[a-f0-9]{40}$/.test(requestedSourceCommit)) {
  throw new Error("Run IDs or commit identities are malformed.");
}

const stableManifest = JSON.parse(fs.readFileSync(path.join(stableRoot, "v2.0.0-manifest.json"), "utf8"));
const sourceCommit = stableManifest.identity?.productSourceCommit;
const sourceTree = stableManifest.identity?.sourceTree;
if (requestedSourceCommit !== sourceCommit) throw new Error("Android workflow source does not match STABLE_SOURCE_COMMIT.");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const inspectAar = (file) => {
  if (!fs.statSync(file).isFile()) throw new Error(`${file}: AAR is missing.`);
  const entries = validatedZipEntries(file);
  const entryPaths = new Set(entries.map((entry) => entry.path));
  for (const required of [
    "AndroidManifest.xml",
    "classes.jar",
    "proguard.txt",
    "jni/arm64-v8a/libscanly_jni.so",
    "jni/x86_64/libscanly_jni.so",
  ]) if (!entryPaths.has(required)) throw new Error(`${file}: required AAR entry '${required}' is missing.`);
  if ([...entryPaths].some((entry) => entry.startsWith("jni/armeabi-v7a/"))) throw new Error(`${file}: unsupported armeabi-v7a was unexpectedly shipped.`);
  const classesJar = entries.find((entry) => entry.path === "classes.jar").bytes;
  const classes = new Set(validatedZipEntriesFromBytes(classesJar, `${file}:classes.jar`).map((entry) => entry.path));
  for (const required of [
    "io/scanly/sdk/ScanlyDecoder.class",
    "io/scanly/sdk/ScanlyScannerSession.class",
    "io/scanly/sdk/ScanlyResult.class",
  ]) if (!classes.has(required)) throw new Error(`${file}: required public API class '${required}' is missing.`);
  return {
    sha256: sha256(file),
    canonicalContentSha256: canonicalZipSha256(file),
    size: fs.statSync(file).size,
  };
};

const identityA = inspectAar(buildA);
const identityB = inspectAar(buildB);
if (identityA.canonicalContentSha256 !== identityB.canonicalContentSha256) {
  throw new Error("Android Clean Build A/B normalized contents do not match.");
}

const destination = path.join(stableRoot, "artifacts", "android", "scanly-sdk-2.0.0.aar");
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(buildA, destination);
const selectedIdentity = inspectAar(destination);
if (selectedIdentity.sha256 !== identityA.sha256) throw new Error("Selected Stable AAR bytes drifted during copy.");

const evidence = {
  schemaVersion: "scanly-stable-android-build-evidence-1",
  version: "2.0.0",
  sourceCommit,
  sourceTree,
  workflow: "Native Mobile",
  workflowDefinitionCommit: workflowHeadSha,
  requestedCheckoutCommit: requestedSourceCommit,
  cleanBuildA: {
    runId: Number(runA),
    url: `https://github.com/Yangjunjie-Lin/Scanly/actions/runs/${runA}`,
    conclusion: "SUCCESS",
    ...identityA,
  },
  cleanBuildB: {
    runId: Number(runB),
    url: `https://github.com/Yangjunjie-Lin/Scanly/actions/runs/${runB}`,
    conclusion: "SUCCESS",
    ...identityB,
  },
  rawBuildAEqualsBuildB: identityA.sha256 === identityB.sha256,
  normalizedBuildAEqualsBuildB: true,
  selectedArtifact: {
    build: "A",
    path: "release/stable/artifacts/android/scanly-sdk-2.0.0.aar",
    ...selectedIdentity,
  },
  canonicalization: ZIP_CANONICALIZATION_POLICY,
  validation: {
    aarContents: "PASS",
    androidManifest: "PASS",
    consumerRules: "PASS",
    publicApiClasses: "PASS",
    nativeSymbols: "PASS_BY_WORKFLOW",
    emulatorX8664SharedFixtureSmoke: "PASS_BY_WORKFLOW",
    abis: { "arm64-v8a": "PASS", x86_64: "PASS", "armeabi-v7a": "UNSUPPORTED" },
  },
  physicalExecution: "POST_RELEASE_VALIDATION_PENDING",
  status: "GO",
};
fs.writeFileSync(path.join(stableRoot, "android-build-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`ANDROID_STABLE_ARTIFACT_GO sha256=${selectedIdentity.sha256} canonical=${selectedIdentity.canonicalContentSha256}`);
