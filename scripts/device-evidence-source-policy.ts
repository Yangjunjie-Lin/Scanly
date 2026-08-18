import { execFileSync } from "node:child_process";

const EVIDENCE_ONLY_PATHS = [
  /^device-evidence\/sessions\/[^/]+\.json$/,
  /^device-evidence\/status\.json$/,
  /^docs\/platform-compatibility\.md$/,
] as const;

const allowedEvidencePath = (file: string): boolean => EVIDENCE_ONLY_PATHS.some((allowed) => allowed.test(file.replace(/\\/g, "/")));

export interface DeviceEvidenceSourceIdentity {
  sourceCommit: string;
  sourceTree: string;
  sdkVersion: string;
}

function lines(output: string): string[] {
  return output.trim().split(/\r?\n/).filter(Boolean);
}

export function deviceEvidenceOnlyAfterSource(root: string, sourceCommit: string, evidenceCommit = "HEAD", includeWorkingTree = false): boolean {
  try {
    const sourceType = execFileSync("git", ["cat-file", "-t", sourceCommit], { cwd: root, encoding: "utf8" }).trim();
    if (sourceType !== "commit") return false;
    execFileSync("git", ["merge-base", "--is-ancestor", sourceCommit, evidenceCommit], { cwd: root, stdio: "ignore" });
    const committed = lines(execFileSync("git", ["diff", "--name-only", "--no-renames", `${sourceCommit}..${evidenceCommit}`], { cwd: root, encoding: "utf8" }));
    if (!committed.every(allowedEvidencePath)) return false;
    if (!includeWorkingTree) return true;
    const tracked = lines(execFileSync("git", ["diff", "--name-only", "--no-renames", sourceCommit], { cwd: root, encoding: "utf8" }));
    const untracked = lines(execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }));
    return [...tracked, ...untracked].every(allowedEvidencePath);
  } catch {
    return false;
  }
}

function exactReleasedSource(
  root: string,
  evidence: DeviceEvidenceSourceIdentity,
  released: DeviceEvidenceSourceIdentity,
  evidenceCommit: string,
): boolean {
  if (
    evidence.sourceCommit !== released.sourceCommit
    || evidence.sourceTree !== released.sourceTree
    || evidence.sdkVersion !== released.sdkVersion
  ) return false;
  try {
    const sourceType = execFileSync("git", ["cat-file", "-t", evidence.sourceCommit], { cwd: root, encoding: "utf8" }).trim();
    if (sourceType !== "commit") return false;
    const actualTree = execFileSync("git", ["show", "-s", "--format=%T", evidence.sourceCommit], { cwd: root, encoding: "utf8" }).trim();
    if (actualTree !== evidence.sourceTree) return false;
    execFileSync("git", ["merge-base", "--is-ancestor", evidence.sourceCommit, evidenceCommit], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function deviceEvidenceEligibleForQualification(
  root: string,
  evidence: DeviceEvidenceSourceIdentity,
  released: DeviceEvidenceSourceIdentity,
  evidenceCommit = "HEAD",
): boolean {
  return exactReleasedSource(root, evidence, released, evidenceCommit)
    || deviceEvidenceOnlyAfterSource(root, evidence.sourceCommit, evidenceCommit);
}
