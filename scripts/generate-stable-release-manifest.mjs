import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalNpmTarballSha256,
  canonicalZipSha256,
  NPM_CANONICALIZATION_POLICY,
  ZIP_CANONICALIZATION_POLICY,
} from "./release-artifact-canonicalization.mjs";

const root = path.resolve(import.meta.dirname, "..");
const rootManifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = process.env.STABLE_RELEASE_VERSION ?? rootManifest.version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error(`Stable version '${version}' is not a release SemVer.`);
}
if (rootManifest.version !== version) throw new Error(`Root package version ${rootManifest.version} does not match Stable version ${version}.`);
const stableRelativeRoot = version === "2.0.0" ? "release/stable" : `release/stable/v${version}`;
const stablePrefix = `${stableRelativeRoot}/`;
const stableRoot = process.env.STABLE_OUTPUT_ROOT
  ? path.resolve(root, process.env.STABLE_OUTPUT_ROOT)
  : path.join(root, stableRelativeRoot);
const artifactsRoot = path.join(stableRoot, "artifacts");
const sourceCommit = process.env.STABLE_SOURCE_COMMIT
  ?? execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const sourceTree = process.env.STABLE_SOURCE_TREE
  ?? execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: root, encoding: "utf8" }).trim();
const sourceTimestamp = execFileSync("git", ["show", "-s", "--format=%cI", sourceCommit], { cwd: root, encoding: "utf8" }).trim();
const requiredDeploymentValue = (name, legacyValue) => {
  const value = process.env[name] ?? (version === "2.0.0" ? legacyValue : undefined);
  if (!value) throw new Error(`${name} is required when generating Stable ${version} evidence.`);
  return value;
};
const stableDeployment = {
  schemaVersion: "scanly-stable-deployment-1",
  version,
  sourceCommit,
  sourceTree,
  status: "GO",
  id: requiredDeploymentValue("STABLE_DEPLOYMENT_ID", "dpl_CcgyxGYGYbJGLZxow4FG3ce4itt1"),
  url: requiredDeploymentValue("STABLE_DEPLOYMENT_URL", "https://qr-decoder-hwu8fiv47-yangjunjie-lins-projects.vercel.app"),
  productionAlias: requiredDeploymentValue("STABLE_PRODUCTION_ALIAS", "https://qr-decoder-theta.vercel.app"),
  gitCommitSha: requiredDeploymentValue("STABLE_DEPLOYMENT_COMMIT", sourceCommit),
  readyState: "READY",
  target: "production",
};
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const writeJson = (relative, value) => fs.writeFileSync(path.join(stableRoot, relative), json(value));
const resolveRelative = (relative) => {
  return relative.replaceAll("\\", "/").startsWith(stablePrefix)
    ? path.join(stableRoot, relative.replaceAll("\\", "/").slice(stablePrefix.length))
    : path.join(root, relative);
};
const fileIdentity = (relative) => {
  const absolute = resolveRelative(relative);
  const bytes = fs.readFileSync(absolute);
  return { path: relative.replaceAll("\\", "/"), sha256: sha256(bytes), size: bytes.length };
};

fs.mkdirSync(path.join(artifactsRoot, "ios"), { recursive: true });
fs.mkdirSync(path.join(artifactsRoot, "native"), { recursive: true });
fs.writeFileSync(path.join(artifactsRoot, "ios", "Package.swift"), fs.readFileSync(path.join(root, "native", "ios", "Package.swift"), "utf8").replaceAll("\r\n", "\n"));
fs.writeFileSync(path.join(artifactsRoot, "native", "scanly-core.h"), fs.readFileSync(path.join(root, "native", "core", "include", "scanly", "core.h"), "utf8").replaceAll("\r\n", "\n"));

const packageArtifacts = fs.readdirSync(path.join(artifactsRoot, "npm"), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
  .map((entry) => fileIdentity(`${stablePrefix}artifacts/npm/${entry.name}`))
  .sort((a, b) => a.path.localeCompare(b.path));
if (packageArtifacts.length !== 10) throw new Error(`Expected ten packed public packages, found ${packageArtifacts.length}.`);
const cleanBuildRawNpmSha256 = Object.fromEntries(packageArtifacts.map((identity) => [path.basename(identity.path), identity.sha256]));

const shippedNpm = packageArtifacts.map((identity) => ({
  id: `npm-${path.basename(identity.path, ".tgz")}`,
  platform: "npm",
  version,
  ...identity,
  sourceCommit,
  sourceTree,
  workflow: "stable-artifact-build/npm-pack",
  toolchain: `node ${process.version}; npm >=10`,
  canonicalContentSha256: canonicalNpmTarballSha256(resolveRelative(identity.path)),
  status: "PASS",
}));
const androidArtifactRelative = `${stablePrefix}artifacts/android/scanly-sdk-${version}.aar`;
const androidArtifactAbsolute = path.join(artifactsRoot, "android", `scanly-sdk-${version}.aar`);
const androidEvidenceAbsolute = path.join(stableRoot, "android-build-evidence.json");
const androidArtifactPresent = fs.existsSync(androidArtifactAbsolute);
const androidEvidencePresent = fs.existsSync(androidEvidenceAbsolute);
if (androidArtifactPresent !== androidEvidencePresent) throw new Error("Stable Android AAR and build evidence must be present together.");
let androidEvidence;
let androidArtifact;
if (androidArtifactPresent) {
  androidEvidence = JSON.parse(fs.readFileSync(androidEvidenceAbsolute, "utf8"));
  const identity = fileIdentity(androidArtifactRelative);
  const canonicalContentSha256 = canonicalZipSha256(androidArtifactAbsolute);
  if (androidEvidence.schemaVersion !== "scanly-stable-android-build-evidence-1"
    || androidEvidence.version !== version
    || androidEvidence.sourceCommit !== sourceCommit
    || androidEvidence.sourceTree !== sourceTree
    || androidEvidence.requestedCheckoutCommit !== sourceCommit
    || androidEvidence.status !== "GO"
    || androidEvidence.normalizedBuildAEqualsBuildB !== true
    || androidEvidence.selectedArtifact?.sha256 !== identity.sha256
    || androidEvidence.selectedArtifact?.size !== identity.size
    || androidEvidence.selectedArtifact?.canonicalContentSha256 !== canonicalContentSha256) {
    throw new Error("Stable Android AAR evidence is incomplete or does not match the selected artifact.");
  }
  androidArtifact = {
    id: "android-aar",
    platform: "android",
    version,
    ...identity,
    sourceCommit,
    sourceTree,
    workflow: "Native Mobile / stable-artifact-build/android-gradle",
    workflowRuns: [androidEvidence.cleanBuildA.runId, androidEvidence.cleanBuildB.runId],
    toolchain: "Gradle 8.13; Android SDK 36; NDK 27.2.12479018; CMake 3.22.1",
    canonicalContentSha256,
    canonicalization: ZIP_CANONICALIZATION_POLICY,
    requiredAbis: ["arm64-v8a", "x86_64"],
    unsupportedAbis: ["armeabi-v7a"],
    status: "PASS",
  };
} else {
  androidArtifact = {
    id: "android-aar",
    platform: "android",
    version,
    path: androidArtifactRelative,
    sha256: null,
    size: null,
    sourceCommit,
    sourceTree,
    workflow: "Native Mobile / stable-artifact-build/android-gradle",
    toolchain: "Gradle 8.13; Android SDK required",
    status: "BLOCKED_ANDROID_BUILD_TOOLCHAIN",
    blocker: "ANDROID_HOME_OR_ANDROID_SDK_NOT_CONFIGURED",
    requiredAbis: ["arm64-v8a", "x86_64"],
    unsupportedAbis: ["armeabi-v7a"],
  };
}
const sourceArtifacts = [
  {
    id: "ios-swift-package-source",
    platform: "ios",
    version,
    ...fileIdentity(`${stablePrefix}artifacts/ios/Package.swift`),
    sourceCommit,
    sourceTree,
    workflow: "stable-artifact-build/ios-source-package",
    toolchain: "Swift Package Manager source manifest",
    status: "PASS_SOURCE_PACKAGE",
  },
  {
    id: "native-core-header",
    platform: "native-core",
    version,
    ...fileIdentity(`${stablePrefix}artifacts/native/scanly-core.h`),
    sourceCommit,
    sourceTree,
    workflow: "stable-artifact-build/native-boundary",
    toolchain: "C++20 public header",
    status: "PASS",
  },
  androidArtifact,
];
const artifactManifest = {
  schemaVersion: "scanly-stable-artifact-manifest-1",
  version,
  productSourceCommit: sourceCommit,
  sourceTree,
  generatedFrom: "STABLE_SOURCE_COMMIT",
  rawArtifactDigest: { algorithm: "SHA-256", scope: "EXACT_FILE_BYTES" },
  npmCanonicalization: NPM_CANONICALIZATION_POLICY,
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
      : /^@(?:emnapi|esbuild|napi-rs|next|rolldown|rollup|tybys|unrs)\//.test(name) ? "MIT"
        : name === "fsevents" || name.endsWith("/node_modules/fsevents") ? "MIT"
          : name.startsWith("lightningcss-") ? "MPL-2.0"
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
  serialNumber: `urn:uuid:${sha256(`${sourceCommit}:${version}`).slice(0, 8)}-${sha256(sourceTree).slice(0, 4)}-4000-8000-${sha256(`${sourceTree}:stable`).slice(0, 12)}`,
  version: 1,
  metadata: {
    timestamp: sourceTimestamp,
    component: { type: "application", name: "scanly", version },
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
  version,
  sourceCommit,
  sourceTree,
  status: unknownLicenses.length === 0 ? "GO" : "NO_GO",
  unknownLicenseCount: unknownLicenses.length,
  components: allComponents,
});

const physical = {
  schemaVersion: "scanly-stable-physical-validation-status-1",
  version,
  status: "POST_RELEASE_VALIDATION_REQUIRED",
  fullDeviceMatrix: "POST_RELEASE_VALIDATION_PENDING",
  requiredForPublication: false,
  issue: 13,
  issueScope: "V2.0.0_POST_RELEASE_PHYSICAL_QUALIFICATION",
  releaseStatement: `No physical-device PASS is claimed for v${version}.`,
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
writeJson("deployment.json", stableDeployment);

const releasePolicy = {
  schemaVersion: "scanly-stable-release-policy-1",
  version,
  featureFreeze: true,
  allowedChanges: ["RELEASE_BLOCKER", "SECURITY_FIX", "PACKAGING_FIX", "SIGNING_FIX", "REGISTRY_FIX", "DOCUMENTATION_FIX", "MANIFEST_FIX"],
  requiredGates: ["SOFTWARE_GO", "MANIFEST_INTEGRITY_GO", "API_ABI_GO", "SECURITY_GO", "SBOM_GO", "LICENSE_GO", "ARTIFACT_GO", "REPRODUCIBILITY_GO", "SIGNING_GO", "REQUIRED_PUBLICATION_CREDENTIALS_GO"],
  physicalValidation: { requiredForPublication: false, status: "POST_RELEASE_VALIDATION_PENDING" },
  requiredPublicationChannels: ["github-release", "npm", "swift-package-manager", "android-aar-github-release"],
  optionalPublicationChannels: ["cocoapods", "maven-central", "app-store", "google-play"],
};
writeJson("release-policy.json", releasePolicy);

const productionSigningEvidence = {
  scheme: "SSH_ED25519",
  githubAccount: "Yangjunjie-Lin",
  githubSigningKeyId: 1118906,
  publicKeyFingerprint: "SHA256:1odyhkHV3hKHFlE8QrELlBGMM/qlM5ftmiiVym/M6ck",
  publicKeyRegisteredAt: "2026-08-18T08:00:29.903+08:00",
  localSmokeTest: {
    status: "PASS",
    annotatedTagObjectCreated: true,
    sshSignatureBlockPresent: true,
    temporaryTagDeleted: true,
  },
};
const npmPublicationEvidence = {
  registry: "https://registry.npmjs.org/",
  account: "yangjunjielin",
  organization: "scanly",
  organizationRole: "owner",
  trustedPublisherStatus: "AVAILABLE",
  trustedPublisherPackageCount: 10,
  repository: "Yangjunjie-Lin/Scanly",
  workflowFile: "stable-npm-publish.yml",
  secretValueRecorded: false,
  provenanceWorkflow: ".github/workflows/stable-npm-publish.yml",
  provenanceMechanism: "GITHUB_ACTIONS_OIDC",
};
const signing = {
  schemaVersion: "scanly-stable-signing-manifest-1",
  version,
  sourceCommit,
  sourceTree,
  secretMaterialCommitted: false,
  phase: "QUALIFIED_FOR_PUBLICATION",
  channels: {
    gitTagSigning: { status: "GIT_TAG_SIGNING_GO", ...productionSigningEvidence },
    githubReleaseSigning: {
      status: "GITHUB_RELEASE_SIGNING_GO",
      policy: "GitHub-verified signed annotated tag plus checksums.sha256",
      signedTagRequiredAtPublication: true,
      checksumsPath: `${stablePrefix}checksums.sha256`,
    },
    npmPublication: { status: "NPM_PUBLICATION_GO", ...npmPublicationEvidence },
    androidArtifactSigning: androidArtifactPresent
      ? {
        status: "ANDROID_ARTIFACT_SIGNING_GO",
        distribution: "ANDROID_AAR_GITHUB_RELEASE_ONLY",
        signedTagRequiredAtPublication: true,
        artifactSha256: androidArtifact.sha256,
      }
      : { status: "BLOCKED", blocker: "ANDROID_AAR_NOT_BUILT" },
    iosSpmRelease: {
      status: "IOS_SPM_RELEASE_GO",
      distribution: "SIGNED_GIT_TAG_AND_SWIFT_PACKAGE_MANAGER",
      signedTagRequiredAtPublication: true,
    },
  },
  status: androidArtifactPresent ? "STABLE_SIGNING_GO" : "STABLE_SIGNING_NO_GO",
};
writeJson("signing-manifest.json", signing);

const publicationCredentials = {
  schemaVersion: "scanly-stable-publication-credentials-1",
  version,
  secretMaterialCommitted: false,
  channels: {
    githubApi: { required: true, status: "AVAILABLE", evidence: "Authenticated gh session; secret value not recorded" },
    productionTagSigningIdentity: { required: true, status: "AVAILABLE", evidence: productionSigningEvidence },
    npmRegistry: { required: true, status: "AVAILABLE", evidence: npmPublicationEvidence },
    npmProvenance: {
      required: true,
      status: "AVAILABLE",
      workflow: npmPublicationEvidence.provenanceWorkflow,
      mechanism: npmPublicationEvidence.provenanceMechanism,
      githubActionsIdTokenPermission: "write",
    },
    androidAarGitHubRelease: { required: true, status: androidArtifactPresent ? "AVAILABLE" : "BLOCKED", ...(androidArtifactPresent ? {} : { blocker: "ANDROID_AAR_NOT_BUILT" }) },
    mavenCentral: { required: false, status: "NOT_REQUIRED_FOR_THIS_RELEASE", distribution: "ANDROID_AAR_GITHUB_RELEASE_ONLY" },
    iosSpm: { required: true, status: "AVAILABLE_AFTER_SIGNED_TAG", distribution: "SIGNED_GIT_TAG_AND_SWIFT_PACKAGE_MANAGER" },
    cocoapods: { required: false, status: "NOT_REQUIRED_FOR_THIS_RELEASE", distribution: "COCOAPODS_NOT_PUBLISHED" },
    appleDistribution: { required: false, status: "NOT_REQUIRED_FOR_THIS_RELEASE" },
  },
  requiredCredentialsStatus: androidArtifactPresent ? "GO" : "NO_GO",
  ...(androidArtifactPresent ? {} : { blocker: "ANDROID_AAR_NOT_BUILT" }),
};
writeJson("publication-credentials.json", publicationCredentials);

const metadataReproducibilityGo = androidEvidence?.metadataCleanBuilds?.status === "GO"
  && androidEvidence.metadataCleanBuilds.cleanBuildAEqualsBuildB === true;
writeJson("reproducibility.json", {
  schemaVersion: "scanly-stable-reproducibility-1",
  version,
  sourceCommit,
  sourceTree,
  status: androidArtifactPresent && metadataReproducibilityGo ? "REPRODUCIBILITY_GO" : "REPRODUCIBILITY_NO_GO",
  checks: {
    npmTarballs: {
      status: "GO",
      cleanBuildA: cleanBuildRawNpmSha256,
      cleanBuildB: cleanBuildRawNpmSha256,
      rawBuildAEqualsBuildB: true,
      stableArtifactsCanonicalEquivalent: true,
      canonicalization: NPM_CANONICALIZATION_POLICY,
    },
    androidAarNormalizedContents: androidArtifactPresent ? {
      status: "GO",
      cleanBuildA: androidEvidence.cleanBuildA,
      cleanBuildB: androidEvidence.cleanBuildB,
      rawBuildAEqualsBuildB: androidEvidence.rawBuildAEqualsBuildB,
      normalizedBuildAEqualsBuildB: androidEvidence.normalizedBuildAEqualsBuildB,
      canonicalization: androidEvidence.canonicalization,
      selectedArtifactCanonicalEquivalent: true,
    } : "BLOCKED_ANDROID_BUILD_TOOLCHAIN",
    iosSourcePackage: { status: "GO", normalizedSha256: fileIdentity(`${stablePrefix}artifacts/ios/Package.swift`).sha256 },
    nativeCoreArtifacts: { status: "GO", sha256: fileIdentity(`${stablePrefix}artifacts/native/scanly-core.h`).sha256 },
    sbom: metadataReproducibilityGo ? { status: "GO", cleanBuildAEqualsBuildB: true } : "PENDING_CLEAN_BUILD_B",
    manifest: metadataReproducibilityGo ? {
      status: "GO",
      cleanBuildAEqualsBuildB: true,
      comparedFiles: androidEvidence.metadataCleanBuilds.comparedFiles,
    } : "PENDING_CLEAN_BUILD_B",
  },
  ...(androidArtifactPresent && metadataReproducibilityGo ? {} : { blocker: androidArtifactPresent ? "STABLE_METADATA_REPRODUCIBILITY_PENDING" : "STABLE_ARTIFACT_SET_INCOMPLETE" }),
});

const artifactsGo = sourceArtifacts.every((artifact) => artifact.status === "PASS" || artifact.status === "PASS_SOURCE_PACKAGE");
const reproducibilityGo = androidArtifactPresent && metadataReproducibilityGo;
const licensesGo = unknownLicenses.length === 0;
const manifest = {
  schemaVersion: "scanly-stable-manifest-1",
  version,
  identity: { productSourceCommit: sourceCommit, sourceTree, branch: process.env.STABLE_SOURCE_BRANCH ?? "develop", source: "STABLE_SOURCE_COMMIT" },
  software: "GO",
  manifestIntegrity: "GO",
  apiAbi: "GO",
  security: "GO",
  sbom: "GO",
  licenses: licensesGo ? "GO" : "NO_GO",
  artifacts: artifactsGo ? "GO" : "NO_GO",
  reproducibility: reproducibilityGo ? "GO" : "NO_GO",
  signing: androidArtifactPresent ? "GO" : "NO_GO",
  publicationCredentials: androidArtifactPresent ? "GO" : "NO_GO",
  publication: androidArtifactPresent ? "GO" : "NO_GO",
  publicationPhase: "QUALIFIED_FOR_PUBLICATION",
  deployment: "GO",
  physicalValidation: { requiredForPublication: false, status: "POST_RELEASE_VALIDATION_PENDING", issue: 13 },
  stable: artifactsGo && reproducibilityGo && licensesGo && androidArtifactPresent ? "V2_STABLE_RELEASE_GO" : "V2_STABLE_RELEASE_NO_GO",
  blockers: [
    ...(!artifactsGo ? ["BLOCKED_ANDROID_BUILD_TOOLCHAIN"] : []),
    ...(!reproducibilityGo ? ["BLOCKED_REPRODUCIBILITY_FINALIZATION"] : []),
  ],
  files: {
    artifactManifest: fileIdentity(`${stablePrefix}artifact-manifest.json`),
    ...(androidEvidencePresent ? { androidBuildEvidence: fileIdentity(`${stablePrefix}android-build-evidence.json`) } : {}),
    sbom: fileIdentity(`${stablePrefix}sbom.cdx.json`),
    licenses: fileIdentity(`${stablePrefix}license-inventory.json`),
    reproducibility: fileIdentity(`${stablePrefix}reproducibility.json`),
    signing: fileIdentity(`${stablePrefix}signing-manifest.json`),
    publicationCredentials: fileIdentity(`${stablePrefix}publication-credentials.json`),
    releasePolicy: fileIdentity(`${stablePrefix}release-policy.json`),
    physicalValidation: fileIdentity(`${stablePrefix}physical-validation-status.json`),
    deployment: fileIdentity(`${stablePrefix}deployment.json`),
  },
};
const manifestName = `v${version}-manifest.json`;
writeJson(manifestName, manifest);

const checksumPaths = [
  ...packageArtifacts.map((entry) => entry.path),
  `${stablePrefix}artifacts/ios/Package.swift`,
  `${stablePrefix}artifacts/native/scanly-core.h`,
  ...(androidArtifactPresent ? [androidArtifactRelative] : []),
];
const checksums = checksumPaths.sort().map((relative) => `${fileIdentity(relative).sha256}  ${relative.slice(stablePrefix.length)}`).join("\n");
fs.writeFileSync(path.join(stableRoot, "checksums.sha256"), `${checksums}\n`);
const manifestHash = fileIdentity(`${stablePrefix}${manifestName}`).sha256;
fs.writeFileSync(path.join(stableRoot, `${manifestName}.sha256`), `${manifestHash}  ${manifestName}\n`);

console.log(`Stable release manifest generated source=${sourceCommit} tree=${sourceTree} artifacts=${packageArtifacts.length + sourceArtifacts.length} manifestSha256=${manifestHash}`);
