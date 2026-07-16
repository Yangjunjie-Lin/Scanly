import path from "node:path";
import { assembleCanonicalEvidence, type EvidenceReportKey } from "./canonical-evidence.js";

const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const inputs = Object.fromEntries((["fast", "balanced", "robust", "comparison"] as EvidenceReportKey[]).map((key) => [key, value(key)])) as Record<EvidenceReportKey, string | undefined>;
const output = value("output");
const missing = Object.entries(inputs).filter(([, file]) => !file).map(([key]) => key);
if (!output || missing.length) throw new Error(`Canonical assembly requires --fast, --balanced, --robust, --comparison, and --output (missing: ${missing.join(", ") || "output"}).`);
const bundle = assembleCanonicalEvidence(Object.fromEntries(Object.entries(inputs).map(([key, file]) => [key, path.resolve(file!)])) as Record<EvidenceReportKey, string>, path.resolve(output));
console.log(`Assembled ${bundle.manifest.evidenceId}: ${bundle.manifestPath}`);
