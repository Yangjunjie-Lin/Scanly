import path from "node:path";
import { assembleCanonicalEvidence, type EvidenceReportKey } from "./canonical-evidence.js";

const value = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
const argumentNames: Record<EvidenceReportKey, string> = {
  fastJson: "fast",
  fastCsv: "fast-csv",
  balancedJson: "balanced",
  balancedCsv: "balanced-csv",
  robustJson: "robust",
  robustCsv: "robust-csv",
  comparisonJson: "comparison",
  symbologiesJson: "symbologies",
};
const inputs = Object.fromEntries(Object.entries(argumentNames).map(([key, argument]) => [key, value(argument)])) as Record<EvidenceReportKey, string | undefined>;
const output = value("output");
const missing = Object.entries(inputs).filter(([, file]) => !file).map(([key]) => key);
if (!output || missing.length) {
  throw new Error(`Canonical assembly requires JSON and CSV profile inputs, Comparison JSON, Symbologies JSON, and --output (missing: ${missing.join(", ") || "output"}).`);
}
const bundle = assembleCanonicalEvidence(Object.fromEntries(Object.entries(inputs).map(([key, file]) => [key, path.resolve(file!)])) as Record<EvidenceReportKey, string>, path.resolve(output));
console.log(`Assembled ${bundle.manifest.evidenceId}: ${bundle.manifestPath}`);
