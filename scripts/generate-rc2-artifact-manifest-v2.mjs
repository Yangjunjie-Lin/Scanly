import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalNpmTarballSha256, NPM_CANONICALIZATION_POLICY } from "./release-artifact-canonicalization.mjs";

const root = path.resolve(import.meta.dirname, "..");
const legacyPath = path.join(root, "release/rc2/artifact-manifest.json");
const artifactRoot = path.join(root, "release/rc2/artifacts");
const output = path.join(root, "release/rc2/artifact-manifest.v2.json");
const legacyBytes = fs.readFileSync(legacyPath);
const legacy = JSON.parse(legacyBytes.toString("utf8"));

if (legacy.schemaVersion !== "rc2-artifact-manifest-1") throw new Error("Historical RC2 Artifact Manifest schema mismatch.");
const artifacts = legacy.artifacts.map((entry) => {
  const absolute = path.join(artifactRoot, ...entry.artifact.split("/"));
  const bytes = fs.readFileSync(absolute);
  const rawSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (rawSha256 !== entry.sha256 || bytes.length !== entry.size) throw new Error(`Historical artifact identity mismatch: ${entry.artifact}`);
  return {
    artifact: entry.artifact,
    platform: entry.platform,
    rawSha256,
    size: bytes.length,
    ...(entry.platform === "npm" ? { canonicalContentSha256: canonicalNpmTarballSha256(absolute) } : {}),
  };
});

const manifest = {
  schemaVersion: "rc2-artifact-manifest-2",
  version: legacy.version,
  productSourceCommit: legacy.sourceCommit,
  sourceTree: legacy.sourceTree,
  rawArtifactDigest: { algorithm: "SHA-256", scope: "EXACT_FILE_BYTES" },
  npmCanonicalization: NPM_CANONICALIZATION_POLICY,
  legacyManifest: {
    path: "release/rc2/artifact-manifest.json",
    sha256: crypto.createHash("sha256").update(legacyBytes).digest("hex"),
    size: legacyBytes.length,
    classification: "LEGACY_BUILD_METADATA_PLATFORM_SPECIFIC",
  },
  artifacts,
};

fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(root, output).replaceAll("\\", "/")} with ${artifacts.length} raw identities and ${artifacts.filter((entry) => entry.platform === "npm").length} canonical npm digests.`);
