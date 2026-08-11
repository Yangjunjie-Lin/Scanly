import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const FORMATS = new Set(["qr_code", "data_matrix", "pdf417", "code_128", "ean_13"]);
const SEVERITIES = ["low", "medium", "high"];

export interface IndustrialCorpusSummary {
  generated: number;
  curated: number;
  negative: number;
  formats: string[];
  difficulties: string[];
}

export function verifyIndustrialCorpus(root = ROOT): IndustrialCorpusSummary {
  const generated = readJson(path.join(root, "fixtures", "beta3", "generated", "manifest.json"));
  const curated = readJson(path.join(root, "fixtures", "beta3", "curated-open-license", "manifest.json"));
  const negative = readJson(path.join(root, "fixtures", "beta3", "adversarial-negative", "manifest.json"));
  const bases = array(generated.bases, "generated.bases"); const difficulties = stringArray(generated.difficulties, "generated.difficulties");
  const baseByDifficulty = record(generated.baseByDifficulty, "generated.baseByDifficulty");
  const severities = stringArray(generated.severities, "generated.severities");
  if (generated.sourceType !== "generated" || generated.schemaVersion !== "beta3-generated-1") fail("Generated corpus identity is invalid.");
  if (new Set(bases.map((entry) => String(record(entry, "generated base").format))).size < 5) fail("Generated corpus must cover five format families.");
  for (const baseValue of bases) {
    const base = record(baseValue, "generated base");
    if (!FORMATS.has(String(base.format)) || typeof base.payload !== "string" || !base.payload || typeof base.file !== "string") fail("Generated base Ground Truth is incomplete.");
    if (!fs.existsSync(path.join(root, base.file))) fail(`Generated base file is missing: ${base.file}`);
  }
  const baseIds = new Set(bases.map((entry) => String(record(entry, "generated base").id)));
  if (difficulties.length !== 14 || severities.join("|") !== SEVERITIES.join("|")) fail("Generated difficulty/severity matrix is incomplete.");
  if (Object.keys(baseByDifficulty).length !== difficulties.length || difficulties.some((difficulty) => !baseIds.has(String(baseByDifficulty[difficulty])))) fail("Generated cross-symbology difficulty mapping is incomplete.");
  const generatedCount = difficulties.length * severities.length;
  if (generated.expandedFixtureCount !== generatedCount) fail("Generated fixture count does not match its matrix.");

  const curatedEntries = array(curated.entries, "curated.entries");
  if (curated.sourceType !== "curated-open-license") fail("Curated source type is invalid.");
  for (const entryValue of curatedEntries) {
    const entry = record(entryValue, "curated entry");
    for (const key of ["sourceUrl", "originalUrl", "license", "sha256", "rightsReview", "format", "payload", "expectedResult"] as const) if (typeof entry[key] !== "string" || !entry[key]) fail(`Curated entry is missing ${key}.`);
    if (!/^https:\/\//.test(String(entry.sourceUrl)) || !/^https:\/\//.test(String(entry.originalUrl)) || !/^[a-f0-9]{64}$/.test(String(entry.sha256))) fail("Curated entry provenance is malformed.");
    if (entry.sourceType === "project-owned") fail("Curated Internet evidence cannot be project-owned.");
  }

  const categories = stringArray(negative.categories, "negative.categories"); const seedsPerCategory = integer(negative.seedsPerCategory, "negative.seedsPerCategory");
  const negativeCount = categories.length * seedsPerCategory;
  if (negative.sourceType !== "generated-adversarial-negative" || negative.expectedResult !== "no-confirmed-result" || categories.length < 10 || negativeCount < 100 || negative.expandedFixtureCount !== negativeCount) fail("Industrial negative corpus is incomplete.");
  return { generated: generatedCount, curated: curatedEntries.length, negative: negativeCount, formats: [...new Set(bases.map((entry) => String(record(entry, "base").format)))], difficulties };
}

function readJson(file: string): Record<string, unknown> { return record(JSON.parse(fs.readFileSync(file, "utf8")), file); }
function record(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, name: string): unknown[] { if (!Array.isArray(value)) fail(`${name} must be an array.`); return value as unknown[]; }
function stringArray(value: unknown, name: string): string[] { const result = array(value, name); if (!result.every((entry) => typeof entry === "string" && entry.length > 0)) fail(`${name} must contain strings.`); return result as string[]; }
function integer(value: unknown, name: string): number { if (!Number.isSafeInteger(value) || (value as number) < 1) fail(`${name} must be positive.`); return value as number; }
function fail(message: string): never { throw new Error(message); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(verifyIndustrialCorpus(), null, 2)}\n`);
}
