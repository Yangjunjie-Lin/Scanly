import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PUBLIC_BARCODE_FORMATS } from "@scanly/core";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
import { loadNormalizedFrameFromPath } from "@scanly/node";
import type { BarcodeFormat } from "@scanly/scenario-schema";

const ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(ROOT, "fixtures", "alpha5", "external-open-license", "manifest.json");
const PROVENANCE_NOTE = "Third-party open-license real-world photograph; not project-owned.";

interface ExternalFixture {
  id: string;
  file: string;
  sourceType: "external-open-license";
  sourceRepository: "Wikimedia Commons";
  sourcePage: string;
  originalFilename: string;
  author: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  retrievedAt: string;
  modifications: unknown[];
  expectedFormat: BarcodeFormat;
  expectedPayload: string | null;
  payloadVerificationStatus: "verified" | "unknown" | "sensitive";
  publicRepositorySafe: boolean;
  provenanceNote: string;
  sha256: string;
  visualVerificationStatus: "verified";
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function expectedDirectory(format: BarcodeFormat): string {
  if (format === "data_matrix") return "data-matrix";
  if (format === "pdf417") return "pdf417";
  if (format === "code_128") return "code128";
  if (["ean_13", "ean_8", "upc_a", "upc_e"].includes(format)) return "retail";
  throw new Error(`External Alpha.5 fixture format is unsupported: ${format}`);
}

function validateMetadata(fixture: ExternalFixture): void {
  const required = [fixture.id, fixture.file, fixture.sourcePage, fixture.originalFilename, fixture.author, fixture.license, fixture.licenseUrl, fixture.attribution, fixture.retrievedAt, fixture.sha256];
  if (required.some((value) => typeof value !== "string" || value.length === 0)) throw new Error(`${fixture.id || "external fixture"}: incomplete metadata`);
  if (fixture.sourceType !== "external-open-license" || fixture.sourceRepository !== "Wikimedia Commons") throw new Error(`${fixture.id}: invalid source classification`);
  if (!fixture.sourcePage.startsWith("https://commons.wikimedia.org/wiki/File:")) throw new Error(`${fixture.id}: sourcePage must be a Wikimedia Commons file page`);
  if (!/^https:\/\//.test(fixture.licenseUrl)) throw new Error(`${fixture.id}: licenseUrl must be HTTPS`);
  if (fixture.provenanceNote !== PROVENANCE_NOTE) throw new Error(`${fixture.id}: invalid provenance note`);
  if (fixture.visualVerificationStatus !== "verified") throw new Error(`${fixture.id}: visual verification is not recorded`);
  if (fixture.publicRepositorySafe !== true || fixture.payloadVerificationStatus === "sensitive") throw new Error(`${fixture.id}: unsafe or sensitive fixture cannot be accepted`);
  if (fixture.payloadVerificationStatus === "unknown" && fixture.expectedPayload !== null) throw new Error(`${fixture.id}: unknown payload must remain null`);
  if (fixture.payloadVerificationStatus === "verified" && typeof fixture.expectedPayload !== "string") throw new Error(`${fixture.id}: verified payload is missing`);
  if (!Array.isArray(fixture.modifications) || fixture.modifications.length !== 0) throw new Error(`${fixture.id}: originals must have an empty modifications array; put transformations under derived/`);
  const normalized = fixture.file.replaceAll("\\", "/");
  const prefix = `fixtures/alpha5/external-open-license/${expectedDirectory(fixture.expectedFormat)}/`;
  if (!normalized.startsWith(prefix) || normalized.includes("/derived/")) throw new Error(`${fixture.id}: original is outside the expected family directory`);
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as { fixtures: ExternalFixture[] };
  const engine = createZxingCppWasmEngine();
  const results: Array<Record<string, unknown>> = [];
  await engine.initialize();
  try {
    for (const fixture of manifest.fixtures) {
      validateMetadata(fixture);
      const absolute = path.join(ROOT, fixture.file);
      if (!fs.existsSync(absolute)) throw new Error(`${fixture.id}: original file is missing`);
      const bytes = fs.readFileSync(absolute);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      if (sha256 !== fixture.sha256) throw new Error(`${fixture.id}: SHA-256 mismatch`);
      const frame = await loadNormalizedFrameFromPath(absolute, fixture.id);
      const started = performance.now();
      const outcome = await engine.decode(frame, { formats: [...PUBLIC_BARCODE_FORMATS], findMultiple: true });
      const elapsedMs = performance.now() - started;
      const actual = outcome.ok ? outcome.results.map((result) => ({ format: result.format, payload: result.text })) : [];
      const formatDetected = actual.some((result) => result.format === fixture.expectedFormat);
      const payloadExact = fixture.payloadVerificationStatus === "unknown"
        ? null
        : actual.some((result) => result.format === fixture.expectedFormat && result.payload === fixture.expectedPayload);
      const wrongFormatDetected = actual.some((result) => result.format !== fixture.expectedFormat);
      const passed = formatDetected && !wrongFormatDetected && (payloadExact === null || payloadExact);
      if (!passed) throw new Error(`${fixture.id}: Scanly result does not match accepted format/payload classification`);
      results.push({ id: fixture.id, sha256, width: frame.width, height: frame.height, elapsedMs, expectedFormat: fixture.expectedFormat, actualResults: actual, payloadVerificationStatus: fixture.payloadVerificationStatus, passed });
    }
  } finally {
    await engine.dispose();
  }

  const latencies = results.map((result) => result.elapsedMs as number);
  const report = {
    schemaVersion: "2.0-alpha5-external-validation-report",
    generatedAt: new Date().toISOString(),
    fixtureCount: results.length,
    projectOwnedRealPhotos: false,
    averageLatencyMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0,
    medianLatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    results,
  };
  const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
  if (outputArgument) {
    const output = path.resolve(outputArgument.slice("--output=".length));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(`Verified ${results.length} external open-license originals; projectOwnedRealPhotos=false.`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
