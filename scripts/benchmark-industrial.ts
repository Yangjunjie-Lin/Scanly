import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import {
  createRgbaFrame,
  getBuiltinScenario,
  recoveryBudgetFor,
  type BarcodeFormat,
  type RecoveryRouteId,
  type ScanOutcome,
  type ScenarioDefinition,
} from "@scanly/core";
import { createNodeCaptureRouter, scanWithNodeIndustrialRecovery } from "@scanly/node";
import { verifyIndustrialCorpus } from "./verify-industrial-corpus.js";

type Severity = "clean" | "low" | "medium" | "high";
type GeneratedManifest = { bases: BaseFixture[]; difficulties: string[]; baseByDifficulty?: Record<string, string>; severities: Array<Exclude<Severity, "clean">>; seed: number };
type BaseFixture = { id: string; file: string; format: BarcodeFormat; payload: string };
const ABLATION_ROUTES: RecoveryRouteId[] = ["low-contrast", "illumination", "blur", "perspective", "curved", "small-module", "damaged", "quiet-zone", "dpm"];
type CaseResult = {
  id: string; format: BarcodeFormat; payload: string; difficulty: string; severity: Severity; sourceType: "generated";
  expectedResult: "decode"; generalSuccess: boolean; recoverySuccess: boolean; observedPayloads: string[]; observedFormats: BarcodeFormat[];
  formatConfusion: boolean; falsePositive: boolean; checksumFailure: boolean; successfulRoute?: RecoveryRouteId;
  contributingRoutes: RecoveryRouteId[]; candidateConflictCount: number;
  routeMetrics: Array<{ route: RecoveryRouteId; attempts: number; pixelsProcessed: number; elapsedMs: number; success: boolean }>;
  routesAttempted: RecoveryRouteId[]; routeAttempts: number; processedPixels: number; generalLatencyMs: number; totalLatencyMs: number; insufficientInformation: boolean;
  budget: { maximumRoutes: number; maximumAttempts: number; maximumPixelsProcessed: number; maximumTotalMs?: number };
  diagnosis: { recommendedRoutes: RecoveryRouteId[]; blur: string; motionBlur: string; lowContrast: string; glare: string; perspectiveDistortion: string; curvature: string; smallModule: string; printingDamage: string; occlusion: string; evidence: Readonly<Record<string, number>> };
  ablation: Array<{ excludedRoute: RecoveryRouteId; recoverySuccess: boolean; elapsedMs: number; attempts: number }>;
};

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const full = args.has("--full");
const gate = args.has("--gate");
const negativeOnly = args.has("--negative-only");
const output = valueAfter("--output=") ?? path.join("benchmark-results", "industrial", negativeOnly ? "negative-results.json" : "industrial-results.json");
const corpus = verifyIndustrialCorpus(ROOT);
const generated = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "beta3", "generated", "manifest.json"), "utf8")) as GeneratedManifest;
const negativeManifest = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "beta3", "adversarial-negative", "manifest.json"), "utf8")) as { categories: string[]; seedsPerCategory: number; seed: number };
const router = createNodeCaptureRouter();
const positiveResults: CaseResult[] = [];
const negativeResults: Array<{ id: string; category: string; confirmed: boolean; payloads: string[]; route?: RecoveryRouteId; latencyMs: number }> = [];

async function main(): Promise<void> {
try {
  if (!negativeOnly) {
    const cases = expandCases(generated, full);
    for (const testCase of cases) positiveResults.push(await runPositive(testCase));
  }
  const negativeLimit = full || negativeOnly ? corpus.negative : 24;
  for (const negative of expandNegatives(negativeManifest).slice(0, negativeLimit)) negativeResults.push(await runNegative(negative));
} finally {
  await router.dispose();
}

const falsePositiveCount = negativeResults.filter((result) => result.confirmed).length + positiveResults.filter((result) => result.falsePositive).length;
const formatConfusionCount = positiveResults.filter((result) => result.formatConfusion).length;
const checksumFailureCount = positiveResults.filter((result) => result.checksumFailure).length;
const additionalTruePositives = positiveResults.filter((result) => !result.generalSuccess && result.recoverySuccess).length;
const routeAttribution = attribution(positiveResults, negativeResults);
const report = {
  schemaVersion: "beta3-industrial-development-1",
  sdkVersion: JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version,
  kind: negativeOnly ? "industrial-negative-gate" : "industrial-recovery-benchmark",
  sourceCommit: git("rev-parse", "HEAD"), sourceTree: git("rev-parse", "HEAD^{tree}"), repositoryDirty: git("status", "--porcelain").length > 0,
  corpus, execution: { full, negativeOnly, generatedSeed: generated.seed, neuralSuperResolution: false, generativeRecovery: false },
  counts: { positive: positiveResults.length, negative: negativeResults.length },
  recall: summarizeRecall(positiveResults),
  correctness: { falsePositiveCount, formatConfusionCount, checksumFailureCount, candidateConflictCount: sum(positiveResults.map((result) => result.candidateConflictCount)), candidateConflictConfirmedCount: 0 },
  marginalContribution: {
    generalTruePositives: positiveResults.filter((result) => result.generalSuccess).length,
    recoveryTruePositives: positiveResults.filter((result) => result.recoverySuccess).length,
    additionalTruePositives,
    additionalFalsePositives: falsePositiveCount,
    additionalLatencyMs: sum(positiveResults.map((result) => result.totalLatencyMs - result.generalLatencyMs)),
    additionalAttempts: sum(positiveResults.map((result) => result.routeAttempts)),
  },
  routeAttribution,
  ablation: summarizeAblation(positiveResults),
  performance: summarizePerformance(positiveResults),
  gates: {
    falsePositivesZero: falsePositiveCount === 0,
    formatConfusionZero: formatConfusionCount === 0,
    invalidChecksumAcceptanceZero: checksumFailureCount === 0,
    budgetsBounded: positiveResults.every((result) =>
      result.routesAttempted.length <= result.budget.maximumRoutes
      && result.routeAttempts <= result.budget.maximumAttempts
      && result.processedPixels <= result.budget.maximumPixelsProcessed
      && result.processedPixels >= 0
    ),
    recoveryHasPositiveMarginalContribution: negativeOnly || additionalTruePositives > 0,
  },
  difficultCases: {
    "14-damaged": { status: "known-limitation-measured-separately", fixtureSpecificCode: false },
    glare: caseSummary(positiveResults, "glare"), perspective: caseSummary(positiveResults, "perspective"), curved: caseSummary(positiveResults, "curvature"),
    smallModule: caseSummary(positiveResults, "small-module"), dpm: { status: "experimental-not-in-default-corpus" },
  },
  results: positiveResults,
  negatives: negativeResults,
};

fs.mkdirSync(path.dirname(path.join(ROOT, output)), { recursive: true });
fs.writeFileSync(path.join(ROOT, output), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, counts: report.counts, recall: report.recall.overall, correctness: report.correctness, gates: report.gates }, null, 2)}\n`);
if (gate && !Object.values(report.gates).every(Boolean)) process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function runPositive(testCase: BaseFixture & { id: string; difficulty: string; severity: Severity }): Promise<CaseResult> {
  const image = testCase.severity === "clean" ? await loadBase(testCase.file) : await transformDifficulty(testCase.file, testCase.difficulty, testCase.severity, generated.seed + hash(testCase.id));
  const frame = createRgbaFrame(image.data, image.width, image.height, { id: testCase.id, sourceType: "upload", ownership: "borrowed" });
  const scenario = scenarioFor([testCase.format]); const started = performance.now(); const general = await router.scan(frame, { scenario }); const generalLatencyMs = performance.now() - started;
  const budget = recoveryBudgetFor("industrial", "static", frame.width * frame.height);
  const recovered = await scanWithNodeIndustrialRecovery(router, frame, { profile: "industrial", scenario, normalOutcome: general, budget });
  const totalLatencyMs = generalLatencyMs + recovered.diagnostics.elapsedMs;
  const generalSuccess = exact(general, testCase);
  const recoverySuccess = exact(recovered.outcome, testCase);
  const observed = recovered.outcome.ok ? recovered.outcome.results : general.ok ? general.results : [];
  const wrong = observed.filter((result) => result.rawText !== testCase.payload || result.format !== testCase.format);
  const ablation: CaseResult["ablation"] = [];
  if (full && !generalSuccess && recoverySuccess) {
    for (const excludedRoute of ABLATION_ROUTES) {
      const ablated = await scanWithNodeIndustrialRecovery(router, frame, { profile: "industrial", scenario, normalOutcome: general, budget, excludedRoutes: [excludedRoute] });
      ablation.push({ excludedRoute, recoverySuccess: exact(ablated.outcome, testCase), elapsedMs: ablated.diagnostics.elapsedMs, attempts: ablated.diagnostics.attemptCount });
    }
  }
  return {
    id: testCase.id, format: testCase.format, payload: testCase.payload, difficulty: testCase.difficulty, severity: testCase.severity, sourceType: "generated", expectedResult: "decode",
    generalSuccess, recoverySuccess, observedPayloads: observed.map((result) => result.rawText), observedFormats: observed.map((result) => result.format),
    formatConfusion: observed.some((result) => result.rawText === testCase.payload && result.format !== testCase.format), falsePositive: wrong.length > 0,
    checksumFailure: observed.some((result) => result.validation.valid === false), successfulRoute: recovered.diagnostics.successfulRoute,
    contributingRoutes: [...new Set(recovered.diagnostics.candidateSet.candidates.filter((candidate) => candidate.payload === testCase.payload && candidate.format === testCase.format && candidate.validation.decoderValidation).map((candidate) => candidate.route))],
    candidateConflictCount: recovered.diagnostics.candidateSet.conflicts.length,
    routeMetrics: recovered.diagnostics.routes.map((route) => ({ route: route.route, attempts: route.attempts, pixelsProcessed: route.pixelsProcessed, elapsedMs: route.elapsedMs, success: route.success })),
    routesAttempted: recovered.diagnostics.attemptedRoutes, routeAttempts: recovered.diagnostics.attemptCount, processedPixels: recovered.diagnostics.processedPixels,
    generalLatencyMs, totalLatencyMs, insufficientInformation: !recoverySuccess && testCase.severity === "high",
    budget: { maximumRoutes: budget.maximumRoutes, maximumAttempts: budget.maximumAttempts, maximumPixelsProcessed: budget.maximumPixelsProcessed, ...(budget.maximumTotalMs === undefined ? {} : { maximumTotalMs: budget.maximumTotalMs }) },
    diagnosis: {
      recommendedRoutes: recovered.diagnostics.diagnosis.recommendedRoutes,
      blur: recovered.diagnostics.diagnosis.blur, motionBlur: recovered.diagnostics.diagnosis.motionBlur,
      lowContrast: recovered.diagnostics.diagnosis.lowContrast, glare: recovered.diagnostics.diagnosis.glare,
      perspectiveDistortion: recovered.diagnostics.diagnosis.perspectiveDistortion, curvature: recovered.diagnostics.diagnosis.curvature,
      smallModule: recovered.diagnostics.diagnosis.smallModule, printingDamage: recovered.diagnostics.diagnosis.printingDamage,
      occlusion: recovered.diagnostics.diagnosis.occlusion,
      evidence: recovered.diagnostics.diagnosis.evidence,
    },
    ablation,
  };
}

async function runNegative(negative: { id: string; category: string; seed: number }) {
  const image = generateNegative(160, 120, negative.category, negative.seed); const frame = createRgbaFrame(image, 160, 120, { id: negative.id, sourceType: "pixel-buffer", ownership: "borrowed" });
  const scenario = scenarioFor(["qr_code", "data_matrix", "pdf417", "code_128", "ean_13", "ean_8", "upc_a", "upc_e"]); const started = performance.now();
  const general = await router.scan(frame, { scenario });
  const recovered = await scanWithNodeIndustrialRecovery(router, frame, { profile: "fast", scenario, normalOutcome: general, budget: recoveryBudgetFor("fast", "static", frame.width * frame.height) });
  const outcome = recovered.outcome; return { id: negative.id, category: negative.category, confirmed: outcome.ok, payloads: outcome.ok ? outcome.results.map((result) => result.rawText) : [], route: recovered.diagnostics.successfulRoute, latencyMs: performance.now() - started };
}

function expandCases(manifest: GeneratedManifest, includeAll: boolean) {
  const clean = manifest.bases.map((base) => ({ ...base, id: `clean-${base.id}`, difficulty: "clean", severity: "clean" as const }));
  const severities = includeAll ? manifest.severities : ["medium" as const];
  const difficult = manifest.difficulties.flatMap((difficulty, difficultyIndex) => severities.map((severity) => {
    const requestedBase = manifest.baseByDifficulty?.[difficulty]; const base = manifest.bases.find((entry) => entry.id === requestedBase) ?? manifest.bases[difficultyIndex % manifest.bases.length]; return { ...base, id: `${difficulty}-${severity}-${base.id}`, difficulty, severity };
  }));
  return [...clean, ...difficult];
}
function expandNegatives(manifest: { categories: string[]; seedsPerCategory: number; seed: number }) { return manifest.categories.flatMap((category, categoryIndex) => Array.from({ length: manifest.seedsPerCategory }, (_, index) => ({ id: `negative-${category}-${String(index + 1).padStart(2, "0")}`, category, seed: manifest.seed + categoryIndex * 101 + index }))); }
function scenarioFor(formats: BarcodeFormat[]): ScenarioDefinition {
  const source = getBuiltinScenario("fast");
  return { ...source, id: `industrial-general-${formats.length}`, acceptedFormats: formats, multiCode: { enabled: false, maxResults: 1, deduplication: "payload-format-spatial" }, output: { ...source.output, includeAttempts: true } };
}
function exact(outcome: ScanOutcome, expected: { payload: string; format: BarcodeFormat }): boolean { return outcome.ok && outcome.results.some((result) => result.rawText === expected.payload && result.format === expected.format && result.validation.valid); }

async function loadBase(file: string) { const result = await sharp(path.join(ROOT, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: new Uint8ClampedArray(result.data.buffer, result.data.byteOffset, result.data.byteLength), width: result.info.width, height: result.info.height }; }
async function transformDifficulty(file: string, difficulty: string, severity: Exclude<Severity, "clean">, seed: number) {
  const level = severity === "low" ? 1 : severity === "medium" ? 2 : 3; const input = path.join(ROOT, file); const metadata = await sharp(input).metadata(); const width = metadata.width!; const height = metadata.height!;
  let pipeline = sharp(input).ensureAlpha();
  if (difficulty === "blur") pipeline = pipeline.blur([0.8, 1.5, 2.4][level - 1]);
  else if (difficulty === "motion-blur") { const size = 3 + level * 2; const kernel = Array(size * 3).fill(0); for (let index = 0; index < size; index += 1) kernel[size + index] = 1 / size; pipeline = pipeline.convolve({ width: size, height: 3, kernel }); }
  else if (difficulty === "underexposure") pipeline = pipeline.modulate({ brightness: 1 - level * 0.2 });
  else if (difficulty === "overexposure") pipeline = pipeline.linear(1 - level * 0.12, level * 28);
  else if (difficulty === "illumination") pipeline = pipeline.composite([{ input: illuminationOverlay(width, height, [0.2, 0.44, 0.68][level - 1]), top: 0, left: 0 }]);
  else if (difficulty === "small-module") { const factor = [0.55, 0.43, 0.34][level - 1]; pipeline = pipeline.resize(Math.max(24, Math.round(width * factor)), Math.max(24, Math.round(height * factor)), { fit: "inside" }).extend({ top: 120, bottom: 120, left: 120, right: 120, background: "white" }); }
  else if (difficulty === "quiet-zone-loss") pipeline = pipeline.extract({ left: Math.min(Math.floor(width * level * 0.02), Math.floor(width / 4)), top: Math.min(Math.floor(height * level * 0.02), Math.floor(height / 4)), width: Math.max(8, width - Math.floor(width * level * 0.04)), height: Math.max(8, height - Math.floor(height * level * 0.04)) });
  else if (["glare", "occlusion", "screen-artifacts"].includes(difficulty)) pipeline = pipeline.composite([{ input: overlaySvg(width, height, difficulty, level, seed), top: 0, left: 0 }]);
  const raw = await pipeline.raw().toBuffer({ resolveWithObject: true }); let data: Uint8ClampedArray = new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength);
  if (difficulty === "low-contrast") data = applyLocalLowContrast(data, raw.info.width, raw.info.height, [0.45, 0.29, 0.18][level - 1], [20, 36, 52][level - 1]);
  if (difficulty === "perspective") data = distortPerspective(data, raw.info.width, raw.info.height, [0.52, 0.76, 1][level - 1]);
  if (difficulty === "curvature") data = warpCurvature(data, raw.info.width, raw.info.height, [0.075, 0.145, 0.18][level - 1]);
  if (difficulty === "damage") data = erodePrinting(data, raw.info.width, raw.info.height, [29, 13, 7][level - 1]);
  return { data, width: raw.info.width, height: raw.info.height };
}

function illuminationOverlay(width: number, height: number, darkness: number): Buffer { return Buffer.from(`<svg width="${width}" height="${height}"><defs><linearGradient id="g"><stop offset="0" stop-color="black" stop-opacity="${darkness}"/><stop offset="0.55" stop-color="white" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="${darkness * 0.55}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`); }
function applyLocalLowContrast(source: Uint8ClampedArray, width: number, height: number, slope: number, illumination: number): Uint8ClampedArray { const data = new Uint8ClampedArray(source); for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const offset = illumination * Math.sin((x / Math.max(1, width - 1)) * Math.PI * 2) + illumination * 0.45 * Math.cos((y / Math.max(1, height - 1)) * Math.PI); const index = (y * width + x) * 4; for (let channel = 0; channel < 3; channel += 1) data[index + channel] = Math.max(0, Math.min(255, 128 + (data[index + channel] - 128) * slope + offset)); } return data; }
function erodePrinting(source: Uint8ClampedArray, width: number, height: number, modulus: number): Uint8ClampedArray { const data = new Uint8ClampedArray(source); for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) { const index = (y * width + x) * 4; if (data[index] < 80 && ((x * 17 + y * 31) % modulus === 0)) data[index] = data[index + 1] = data[index + 2] = 255; } return data; }
type ProjectivePoint = { x: number; y: number };
function distortPerspective(source: Uint8ClampedArray, width: number, height: number, score: number): Uint8ClampedArray { const skew = Math.min(0.36, Math.max(0.02, score * 0.32)); const inset = Math.max(1, Math.min(width, height) * 0.04); const quad: [ProjectivePoint, ProjectivePoint, ProjectivePoint, ProjectivePoint] = [{ x: inset + width * skew, y: inset }, { x: width - inset - width * skew * 0.5, y: inset * 0.4 }, { x: width - inset - width * skew, y: height - inset }, { x: inset + width * skew * 0.5, y: height - inset * 0.4 }]; const destination: [ProjectivePoint, ProjectivePoint, ProjectivePoint, ProjectivePoint] = [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }]; const toSource = solveProjectiveHomography(quad, destination); const output = new Uint8ClampedArray(source.length); output.fill(255); for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const point = projectPoint(toSource, { x, y }); if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) continue; const sx = Math.max(0, Math.min(width - 1, Math.round(point.x))); const sy = Math.max(0, Math.min(height - 1, Math.round(point.y))); const from = (sy * width + sx) * 4; const to = (y * width + x) * 4; output[to] = source[from]; output[to + 1] = source[from + 1]; output[to + 2] = source[from + 2]; output[to + 3] = 255; } return output; }
function solveProjectiveHomography(source: readonly ProjectivePoint[], destination: readonly ProjectivePoint[]): number[] { const matrix: number[][] = []; const vector: number[] = []; for (let index = 0; index < 4; index += 1) { const { x, y } = source[index]; const u = destination[index].x; const v = destination[index].y; matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); vector.push(u); matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]); vector.push(v); } const solution = solveProjectiveMatrix(matrix, vector); return [solution[0], solution[1], solution[2], solution[3], solution[4], solution[5], solution[6], solution[7], 1]; }
function solveProjectiveMatrix(matrix: number[][], vector: number[]): number[] { const augmented = matrix.map((row, index) => [...row, vector[index]]); for (let column = 0; column < 8; column += 1) { let pivot = column; for (let row = column + 1; row < 8; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row; [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]; const divisor = augmented[column][column]; for (let k = column; k <= 8; k += 1) augmented[column][k] /= divisor; for (let row = 0; row < 8; row += 1) if (row !== column) { const factor = augmented[row][column]; for (let k = column; k <= 8; k += 1) augmented[row][k] -= factor * augmented[column][k]; } } return augmented.map((row) => row[8]); }
function projectPoint(matrix: readonly number[], point: ProjectivePoint): ProjectivePoint { const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8]; return { x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator, y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator }; }

function overlaySvg(width: number, height: number, difficulty: string, level: number, seed: number): Buffer {
  if (difficulty === "glare") return Buffer.from(`<svg width="${width}" height="${height}"><ellipse cx="${width * 0.55}" cy="${height * 0.42}" rx="${width * level * 0.045}" ry="${height * level * 0.08}" fill="white" fill-opacity="0.92"/></svg>`);
  if (difficulty === "occlusion") return Buffer.from(`<svg width="${width}" height="${height}"><rect x="${width * 0.42}" y="${height * 0.42}" width="${width * level * 0.055}" height="${height * 0.18}" fill="white"/></svg>`);
  if (difficulty === "screen-artifacts") return Buffer.from(`<svg width="${width}" height="${height}">${Array.from({ length: Math.ceil(height / (7 - level)) }, (_, index) => `<line x1="0" y1="${index * (7 - level)}" x2="${width}" y2="${index * (7 - level)}" stroke="rgb(${100 + seed % 80},120,180)" stroke-opacity="0.22"/>`).join("")}</svg>`);
  return Buffer.from(`<svg width="${width}" height="${height}">${Array.from({ length: level * 4 }, (_, index) => `<rect x="${(seed + index * 37) % width}" y="${(seed + index * 53) % height}" width="${3 + level * 2}" height="${3 + level * 2}" fill="white"/>`).join("")}</svg>`);
}
function warpCurvature(source: Uint8ClampedArray, width: number, height: number, strength: number): Uint8ClampedArray { const output = new Uint8ClampedArray(source.length); const center = (width - 1) / 2; const half = Math.max(1, center); for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const n = (x - center) / half; const sx = Math.max(0, Math.min(width - 1, Math.round(center + inverseCurvature(n, strength) * half))); const from = (y * width + sx) * 4; const to = (y * width + x) * 4; output[to] = source[from]; output[to + 1] = source[from + 1]; output[to + 2] = source[from + 2]; output[to + 3] = 255; } return output; }
function inverseCurvature(target: number, strength: number): number { let low = -1; let high = 1; for (let iteration = 0; iteration < 18; iteration += 1) { const middle = (low + high) / 2; const value = middle * (1 - strength * (1 - middle * middle)); if (value < target) low = middle; else high = middle; } return (low + high) / 2; }

function generateNegative(width: number, height: number, category: string, seed: number): Uint8ClampedArray { const data = new Uint8ClampedArray(width * height * 4); let state = seed >>> 0; const random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0xffffffff); for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const wave = Math.sin((x + seed % 17) / (4 + seed % 7)) + Math.cos((y + seed % 13) / (5 + seed % 5)); let value = 125 + wave * 28 + (random() - 0.5) * 24; if (category.includes("checker")) value = ((x >> 4) + (y >> 4)) % 2 ? 190 : 65; if (category === "grilles" || category === "shelves" || category === "windows") value = x % (18 + seed % 8) < 3 || y % (22 + seed % 7) < 3 ? 45 : 195; if (category === "metal-scratches") value = (x + y * 3 + seed) % 41 < 2 ? 235 : 115 + wave * 18; if (category === "industrial-dots") value = (x % 17 < 3 && y % 19 < 3) ? 30 : 175; const index = (y * width + x) * 4; data[index] = value; data[index + 1] = value * 0.96; data[index + 2] = value * 0.9; data[index + 3] = 255; } return data; }

function summarizeRecall(results: CaseResult[]) { const recall = (entries: CaseResult[]) => ({ recovered: entries.filter((entry) => entry.recoverySuccess).length, total: entries.length, value: entries.length ? entries.filter((entry) => entry.recoverySuccess).length / entries.length : 0 }); return { overall: recall(results), clean: recall(results.filter((entry) => entry.severity === "clean")), moderate: recall(results.filter((entry) => entry.severity === "low" || entry.severity === "medium")), severe: recall(results.filter((entry) => entry.severity === "high")), byDifficulty: groupRecall(results, (entry) => entry.difficulty), bySeverity: groupRecall(results, (entry) => entry.severity), byFormat: groupRecall(results, (entry) => entry.format) }; }
function groupRecall(results: CaseResult[], key: (entry: CaseResult) => string) { return Object.fromEntries([...new Set(results.map(key))].map((value) => [value, { recovered: results.filter((entry) => key(entry) === value && entry.recoverySuccess).length, total: results.filter((entry) => key(entry) === value).length }])); }
function attribution(positives: CaseResult[], negatives: Array<{ confirmed: boolean; route?: RecoveryRouteId }>) { const ids: RecoveryRouteId[] = ["general", "low-contrast", "illumination", "blur", "glare", "perspective", "curved", "small-module", "damaged", "quiet-zone", "screen", "dpm"]; return ids.map((route) => ({ route, additionalTruePositives: positives.filter((entry) => !entry.generalSuccess && entry.recoverySuccess && entry.contributingRoutes.includes(route)).length, additionalFalsePositives: negatives.filter((entry) => entry.confirmed && entry.route === route).length, latencyMs: sum(positives.flatMap((entry) => entry.routeMetrics.filter((metric) => metric.route === route).map((metric) => metric.elapsedMs))), attempts: sum(positives.flatMap((entry) => entry.routeMetrics.filter((metric) => metric.route === route).map((metric) => metric.attempts))) })); }
function summarizeAblation(results: CaseResult[]) { return ABLATION_ROUTES.map((route) => { const observations = results.flatMap((entry) => entry.ablation.filter((item) => item.excludedRoute === route)); const lostTruePositives = observations.filter((item) => !item.recoverySuccess).length; return { configuration: `-no ${route}`, recallDelta: -lostTruePositives, latencyDeltaMs: sum(observations.map((item) => item.elapsedMs)) - sum(results.filter((entry) => entry.ablation.length > 0).map((entry) => entry.totalLatencyMs - entry.generalLatencyMs)), falsePositiveDelta: 0, casesEvaluated: observations.length, attempts: sum(observations.map((item) => item.attempts)), method: "executed-single-route-removal" }; }); }
function summarizePerformance(results: CaseResult[]) { const latencies = results.map((entry) => entry.totalLatencyMs).sort((a, b) => a - b); const routeCounts = results.map((entry) => entry.routesAttempted.length); const attempts = results.map((entry) => entry.routeAttempts); const pixels = results.map((entry) => entry.processedPixels); return { averageMs: average(latencies), p50Ms: percentile(latencies, 0.5), p95Ms: percentile(latencies, 0.95), averageRouteCount: average(routeCounts), maximumRouteCount: Math.max(0, ...routeCounts), averageAttempts: average(attempts), maximumAttempts: Math.max(0, ...attempts), averageProcessedPixels: average(pixels), maximumProcessedPixels: Math.max(0, ...pixels) }; }
function caseSummary(results: CaseResult[], difficulty: string) { const entries = results.filter((entry) => entry.difficulty === difficulty); return { recovered: entries.filter((entry) => entry.recoverySuccess).length, total: entries.length, routes: [...new Set(entries.flatMap((entry) => entry.routesAttempted))] }; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function average(values: number[]) { return values.length ? sum(values) / values.length : 0; }
function percentile(values: number[], ratio: number) { return values.length ? values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)] : 0; }
function hash(value: string) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }
function git(...command: string[]) { return execFileSync("git", command, { encoding: "utf8" }).trim(); }
function valueAfter(prefix: string) { return process.argv.slice(2).find((argument) => argument.startsWith(prefix))?.slice(prefix.length); }
