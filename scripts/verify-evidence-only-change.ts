import path from "node:path";
import { verifyEvidenceCommitPolicy, verifyEvidenceWorkingTreePolicy } from "./benchmark-provenance.js";

const ROOT = path.resolve(__dirname, "..");
const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const sourceCommit = value("source-commit");
const sourceTree = value("source-tree");
const suppliedEvidenceCommit = value("evidence-commit");
const evidenceCommit = suppliedEvidenceCommit ?? "HEAD";
const workingTree = process.argv.includes("--working-tree") || !suppliedEvidenceCommit;

if (!sourceCommit || !sourceTree) throw new Error("Evidence-only verification requires --source-commit=<sha> and --source-tree=<sha>.");
const failures = workingTree
  ? verifyEvidenceWorkingTreePolicy(ROOT, sourceCommit, sourceTree)
  : verifyEvidenceCommitPolicy(ROOT, sourceCommit, sourceTree, evidenceCommit);
if (failures.length) throw new Error(`Evidence-only policy failed:\n- ${failures.join("\n- ")}`);
console.log(`Evidence-only policy passed for ${workingTree ? "the working tree" : evidenceCommit} relative to ${sourceCommit}.`);
