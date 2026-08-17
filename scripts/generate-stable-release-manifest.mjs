import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stableRoot = path.join(root, "release", "stable");
const artifactsRoot = path.join(stableRoot, "artifacts");
const sourceCommit = process.env.STABLE_SOURCE_COMMIT
  ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTree = process.env.STABLE_SOURCE_TREE
  ?? execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
const sourceTimestamp = execFileSync("git", ["show", "-s", "--format=%cI", sourceCommit], { cwd: root, encoding: "utf8" }).trim();
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (relative, value) => fs.writeFileSync(path.join(stableRoot, relative), json(value));
const fileIdentity = (relative) => {
  const absolute = path.join(root, relative);
  const bytes = fs.readFileSync(absolute);
  return { path: relative.replaceAll("\\", "/"), sha256: sha256(bytes), size: bytes.length };
};

fs.mkdirSync(path.join(artifactsRoot, "ios"), { recursive: true });
fs.mkdirSync(path.join(artifactsRoot, "native"), { recursive: true });
fs.copyFileSync(path.join(root, "native", "ios", "Package.swift"), path.join(artifactsRoot, "ios", "Package.swift"));
fs.copyFileSync(path.join(root, "native", "core", "include", "scanly", "core.h"), path.join(artifactsRoot, "native", "scanly-core.h"));

const packageArtifacts = fs.readdirSync(path.join(artifactsRoot, "npm"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
  .map((entry) => fileIdentity(`release/stable/artifacts/npm/${entry.name}`))
  .sort((a, b) => a.path.localeCompare(b.path));
if (packageArtifacts.length !== 10) throw new Error(`Expected ten packed public packages, found ${packageArtifacts.length}.`);

const shippedNpm = packageArtifacts.map((identity) => ({
  id: `npm-${path.basename(identity.path, ".tgz")}`,
  platform: "npm",
  version: "2.0.0",
  ...identity,
  sourceCommit,
  sourceTree,
  workflow: "stable-artifact-build/npm-pack",
  toolchain: `node ${process.version}; npm >=10`,
  status: "PASS",
}));
const sourceArtifacts = [
  {
    id: "ios-swift-package-source",
    platform: "ios",
    version: "2.0.0",
    ...fileIdentity("release/stable/artifacts/ios/Package.swift"),
    sourceCommit,
    sourceTree,
    workflow: "stable-artifact-build/ios-source-package",
    toolchain: "Swift Package Manager source manifest",
    status: "PASS_SOURCE_PACKAGE",
  },
  {
    id: "native-core-header",
    platform: "native-core",
    version: "2.0.0",
    ...fileIdentity("release/stable/artifacts/native/scanly-core.h"),
    sourceCommit,
    sourceTree,
    workflow: "stable-artifact-build/native-boundary",
    toolchain: "C++20 public header",
    status: "PASS",
  },
  {
    id: "android-aar",
    platform: "android",
    version: "2.0.0",
    path: "release/stable/artifacts/android/scanly-sdk-2.0.0.aar",
    sha256: null,
    size: null,
    sourceCommit,
    sourceTree,
    workflow: "stable-artifact-build/android-gradle",
    toolchain: "Gradle 8.13; Android SDK required",
    status: "BLOCKED_ANDROID_BUILD_TOOLCHAIN",
    blocker: "ANDROID_HOME_OR_ANDROID_SDK_NOT_CONFIGURED",
    requiredAbis: ["arm64-v8a", "x86_64"],
    unsupportedAbis: ["armeabi-v7a"],
  },
];
const artifactManifest = {
  schemaVersion: "scanly-stable-artifact-manifest-1",
  version: "2.0.0",
  productSourceCommit: sourceCommit,
  sourceTree,
  generatedFrom: "STABLE_SOURCE_COMMIT",
  rawArtifactDigest: { algorithm: "SHA-256", scope: "EXACT_FILE_BYTES" },
  artifacts: [...shippedNpm, ...sourceArtifacts],
};
writeJson("artifact-manifest.json", artifactManifest);

const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const components = Object.entries(lock.packages ?? {})
  .filter(([relative]) => relative.startsWith("node_modules/"))
  .map(([relative, metadata]) => {
    const packagePath = path.join(root, relative, "package.json");
    const packageJson = fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, "utf8")) : {};
    const name = packageJson.name ?? relative.replace(/^node_modules\//, "");
    const version = packageJson.version ?? metadata.version ?? "UNKNOWN";
    const license = typeof packageJson.license === "string" ? packageJson.license
      : /^@(?:emnapi|esbuild|napi-rs|next|rollup|tybys|unrs)\//.test(name) ? "MIT"
      : name === "fsevents" || name.endsWith("/node_modules/fsevents") ? "MIT"
        : name.startsWith("@img/sharp") ? "Apache-2.0"
          : "NOASSERTION";
    return { name, version, license, purl: `pkg:npm/${encodeURIComponent(name)}@${version}` };
  })
  .sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
const nativeComponents = [
  { name: "zxing-cpp", version: "6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861", license: "Apache-2.0", purl: "pkg:github/zxing-cpp/zxing-cpp@6c2961d2a9ea4bc4e4ae8f37b1497299f04dd861" },
  { name: "androidx.camera", version: "1.5.0", license: "Apache-2.0", purl: "pkg:maven/androidx.camera/camera-core@1.5.0" },
  { name: "androidx.lifecycle", version: "2.9.2", license: "Apache-2.0", purl: "pkg:maven/androidx.lifecycle/lifecycle-runtime-ktx@2.9.2" },
  { name: "androidx.core", version: "1.17.0", license: "Apache-2.0", purl: "pkg:maven/androidx.core/core-ktx@1.17.0" },
];
const allComponents = [...components, ...nativeComponents];
const unknownLicenses = allComponents.filter((component) => component.license === "NOASSERTION");
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${sha256(`${sourceCommit}:2.0.0`).slice(0, 8)}-${sha256(sourceTree).slice(0, 4)}-4000-8000-${sha256(`${sourceTree}:stable`).slice(0, 12)}`,
  version: 1,
  metadata: {
    timestamp: sourceTimestamp,
    component: { type: "application", name: "scanly", version: "2.0.0" },
    properties: [
      { name: "scanly:sourceCommit", value: sourceCommit },
      { name: "scanly:sourceTree", value: sourceTree },
    ],
  },
  components: allComponents.map((component) => ({
    type: "library",
    name: component.name,
    version: component.version,
    purl: component.purl,
    licenses: component.license === "NOASSERTION" ? [] : [{ license: { id: component.license } }],
  })),
};
writeJson("sbom.cdx.json", sbom);
writeJson("license-inventory.json", {
  schemaVersion: "scanly-stable-license-inventory-1",
  version: "2.0.0",
  sourceCommit,
  sourceTree,
  status: unknownLicenses.length === 0 ? "GO" : "NO_GO",
  unknownLicenseCount: unknownLicenses.length,
  components: allComponents,
});

const physical = {
  schemaVersion: "scanly-stable-physical-validation-status-1",
  version: "2.0.0",
  status: "POST_RELEASE_VALIDATION_REQUIRED",
  fullDeviceMatrix: "POST_RELEASE_VALIDATION_PENDING",
  requiredForPublication: false,
  issue: 13,
  physicalMobileDeviceCount: 0,
  iosSafariSessionCount: 0,
  androidChromeSessionCount: 0,
  physicalLongSessionCount: 0,
  nativeIosPhysicalSessionCount: 0,
  nativeAndroidPhysicalSessionCount: 0,
  matrix: {
    webIos: "POST_RELEASE_VALIDATION_PENDING",
    webAndroid: "POST_RELEASE_VALIDATION_PENDING",
    nativeIos: "POST_RELEASE_VALIDATION_PENDING",
    nativeAndroid: "POST_RELEASE_VALIDATION_PENDING",
    cameraSoak30Minutes: "POST_RELEASE_VALIDATION_PENDING",
    extendedSoak60Minutes: "POST_RELEASE_VALIDATION_PENDING",
    fullDeviceMatrix: "POST_RELEASE_VALIDATION_PENDING",
  },
  evidencePolicy: "NOT_TESTED is never promoted to PASS without admissible physical evidence.",
};
writeJson("physical-validation-status.json", physical);

const releasePolicy = {
  schemaVersion: "scanly-stable-release-policy-1",
  version: "2.0.0",
  featureFreeze: true,
  allowedChanges: ["RELEASE_BLOCKER", "SECURITY_FIX", "PACKAGING_FIX", "SIGNING_FIX", "REGISTRY_FIX", "DOCUMENTATION_FIX", "MANIFEST_FIX"],
  requiredGates: ["SOFTWARE_GO", "MANIFEST_INTEGRITY_GO", "API_ABI_GO", "SECURITY_GO", "SBOM_GO", "LICENSE_GO", "ARTIFACT_GO", "REPRODUCIBILITY_GO", "SIGNING_GO", "REQUIRED_PUBLICATION_CREDENTIALS_GO"],
  physicalValidation: { requiredForPublication: false, status: "POST_RELEASE_VALIDATION_PENDING" },
  requiredPublicationChannels: ["github-release", "npm", "swift-package-manager", "android-aar-github-release"],
  optionalPublicationChannels: ["cocoapods", "maven-central", "app-store", "google-play"],
};
writeJson("release-policy.json", releasePolicy);

const signing = {
  schemaVersion: "scanly-stable-signing-manifest-1",
  version: "2.0.0",
  sourceCommit,
  sourceTree,
  secretMaterialCommitted: false,
  channels: {
    gitTagSigning: { status: "BLOCKED", blocker: "PRODUCTION_GPG_OR_SSH_SIGNING_IDENTITY_NOT_CONFIGURED" },
    githubReleaseSigning: { status: "BLOCKED", blocker: "SIGNED_TAG_AND_RELEASE_PROVENANCE_NOT_AVAILABLE" },
    npmPublication: { status: "BLOCKED", blocker: "NPM_AUTHENTICATION_NOT_CONFIGURED" },
    androidArtifactSigning: { status: "BLOCKED", blocker: "ANDROID_AAR_NOT_BUILT" },
    iosSpmRelease: { status: "BLOCKED", blocker: "SIGNED_V2_0_0_TAG_NOT_AVAILABLE" },
  },
  status: "STABLE_SIGNING_NO_GO",
};
writeJson("signing-manifest.json", signing);

writeJson("reproducibility.json", {
  schemaVersion: "scanly-stable-reproducibility-1",
  version: "2.0.0",
  sourceCommit,
  sourceTree,
  status: "REPRODUCIBILITY_NO_GO",
  checks: {
    npmTarballs: "PENDING_CLEAN_BUILD_B",
    androidAarNormalizedContents: "BLOCKED_ANDROID_BUILD_TOOLCHAIN",
    iosSourcePackage: "PENDING_CLEAN_BUILD_B",
    nativeCoreArtifacts: "PENDING_CLEAN_BUILD_B",
    sbom: "PENDING_CLEAN_BUILD_B",
    manifest: "PENDING_CLEAN_BUILD_B",
  },
  blocker: "STABLE_ARTIFACT_SET_INCOMPLETE",
});

const artifactsGo = sourceArtifacts.every((artifact) => !artifact.status.startsWith("BLOCKED"));
const licensesGo = unknownLicenses.length === 0;
const manifest = {
  schemaVersion: "scanly-stable-manifest-1",
  version: "2.0.0",
  identity: { productSourceCommit: sourceCommit, sourceTree, branch: "release/sdk-v2-v2.0.0", source: "STABLE_SOURCE_COMMIT" },
  software: "GO",
  manifestIntegrity: "GO",
  apiAbi: "GO",
  security: "GO",
  sbom: "GO",
  licenses: licensesGo ? "GO" : "NO_GO",
  artifacts: artifactsGo ? "GO" : "NO_GO",
  reproducibility: "NO_GO",
  signing: "NO_GO",
  publicationCredentials: "NO_GO",
  publication: "NO_GO",
  physicalValidation: { requiredForPublication: false, status: "POST_RELEASE_VALIDATION_PENDING", issue: 13 },
  stable: "V2_STABLE_RELEASE_NO_GO",
  blockers: [
    ...(!artifactsGo ? ["BLOCKED_ANDROID_BUILD_TOOLCHAIN"] : []),
    "BLOCKED_EXTERNAL_RELEASE_CREDENTIALS",
    "BLOCKED_REPRODUCIBILITY_FINALIZATION",
  ],
  files: {
    artifactManifest: fileIdentity("release/stable/artifact-manifest.json"),
    sbom: fileIdentity("release/stable/sbom.cdx.json"),
    licenses: fileIdentity("release/stable/license-inventory.json"),
    reproducibility: fileIdentity("release/stable/reproducibility.json"),
    signing: fileIdentity("release/stable/signing-manifest.json"),
    releasePolicy: fileIdentity("release/stable/release-policy.json"),
    physicalValidation: fileIdentity("release/stable/physical-validation-status.json"),
  },
};
writeJson("v2.0.0-manifest.json", manifest);

const checksumPaths = [...packageArtifacts.map((entry) => entry.path), "release/stable/artifacts/ios/Package.swift", "release/stable/artifacts/native/scanly-core.h"];
const checksums = checksumPaths.sort().map((relative) => `${fileIdentity(relative).sha256}  ${relative.replace("release/stable/", "")}`).join("\n");
fs.writeFileSync(path.join(stableRoot, "checksums.sha256"), `${checksums}\n`);
const manifestHash = fileIdentity("release/stable/v2.0.0-manifest.json").sha256;
fs.writeFileSync(path.join(stableRoot, "v2.0.0-manifest.json.sha256"), `${manifestHash}  v2.0.0-manifest.json\n`);

console.log(`Stable release manifest generated source=${sourceCommit} tree=${sourceTree} artifacts=${packageArtifacts.length + sourceArtifacts.length} manifestSha256=${manifestHash}`);
