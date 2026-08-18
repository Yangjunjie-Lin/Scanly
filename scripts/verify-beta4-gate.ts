import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

type GateMode = "integration" | "release";
type Json = Record<string, unknown>;

const root = process.cwd();
const modeArgument = process.argv.find((argument) => argument.startsWith("--mode="));
const mode = modeArgument?.slice("--mode=".length) as GateMode | undefined;

if (mode !== "integration" && mode !== "release") {
  throw new Error("Beta 4 gate requires --mode=integration or --mode=release.");
}

const read = (relative: string): Json =>
  JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as Json;
const requireNumber = (status: Json, key: string): number => {
  const value = status[key];
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`device-evidence/status.json ${key} must be a non-negative integer.`);
  }
  return value as number;
};
const requireValue = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

// The evidence verifier remains the sole authority for admissibility, exact-source
// identity, physical-device classification, and all derived evidence counts.
execFileSync(process.execPath, ["--import", "tsx", "scripts/verify-device-evidence.ts"], {
  cwd: root,
  stdio: "inherit",
});

const status = read("device-evidence/status.json");
const counts = {
  physicalMobileDeviceCount: requireNumber(status, "physicalMobileDeviceCount"),
  iosSafariSessionCount: requireNumber(status, "iosSafariSessionCount"),
  androidChromeSessionCount: requireNumber(status, "androidChromeSessionCount"),
  physicalScenarioCount: requireNumber(status, "physicalScenarioCount"),
  physicalLongSessionCount: requireNumber(status, "physicalLongSessionCount"),
  desktopCameraSessionCount: requireNumber(status, "desktopCameraSessionCount"),
};

if (mode === "integration") {
  requireValue(
    status.physicalValidationStatus === "POST_RELEASE_VALIDATION_PENDING"
      || status.physicalValidationStatus === "PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED",
    "Integration requires an honest post-release pending or verifier-proven physical validation state.",
  );
  requireValue(status.matrixStatus === "DEVICE_MATRIX_PARTIAL", "Integration must retain FULL_DEVICE_MATRIX_PENDING.");
  requireValue(status.fullDeviceMatrixStatus === "FULL_DEVICE_MATRIX_PENDING", "Integration must retain FULL_DEVICE_MATRIX_PENDING.");
  const physicalStatus = String(status.physicalValidationStatus);
  console.log(
    "BETA4_DEVICE_INTEGRATION_GO / DEVICE_HARNESS_GO / "
      + `${physicalStatus} / FULL_DEVICE_MATRIX_PENDING / POST_RELEASE_QUALIFICATION_OPEN`,
  );
  process.exit(0);
}

const releaseRequirements: Array<[boolean, string]> = [
  [status.physicalValidationStatus === "PHYSICAL_DEVICE_VALIDATION_STARTED_AND_MINIMUM_GATE_PASSED", "exact-source physical validation minimum"],
  [status.matrixStatus === "FULL_DEVICE_MATRIX_COMPLETE", "full physical device matrix"],
  [status.fullDeviceMatrixStatus === "FULL_DEVICE_MATRIX_COMPLETE", "full physical device matrix project state"],
  [Array.isArray(status.requiredGaps) && status.requiredGaps.length === 0, "zero remaining physical evidence gaps"],
  [counts.physicalMobileDeviceCount >= 5, "two iOS and three Android physical device classes"],
  [counts.iosSafariSessionCount >= 2, "two real iOS Safari sessions"],
  [counts.androidChromeSessionCount >= 3, "three real Android Chrome sessions"],
  [counts.physicalScenarioCount >= 65, "P1-P12 and N1 on the five required mobile devices"],
  [counts.physicalLongSessionCount >= 1, "qualifying physical-mobile camera soak"],
  [counts.desktopCameraSessionCount >= 1, "desktop real-camera matrix row"],
];
// Full post-release qualification must additionally activate explicit
// evidence-to-matrix-row contracts. The current schema intentionally cannot
// promote model names or device counts into second-generation/tier claims.
releaseRequirements.push([false, "full physical matrix-row evidence contract activation"]);
const missing = releaseRequirements.filter(([passed]) => !passed).map(([, label]) => label);
if (missing.length) {
  throw new Error(`POST_RELEASE_PHYSICAL_VALIDATION_NO_GO: missing ${missing.join(", ")}.`);
}

console.log("POST_RELEASE_PHYSICAL_VALIDATION_GO");
