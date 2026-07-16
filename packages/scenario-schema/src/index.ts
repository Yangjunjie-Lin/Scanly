export const SCENARIO_SCHEMA_VERSION = "2.0" as const;

export type BarcodeFormat =
  | "qr_code"
  | "micro_qr"
  | "rmqr"
  | "data_matrix"
  | "gs1_data_matrix"
  | "pdf417"
  | "micro_pdf417"
  | "aztec"
  | "code_128"
  | "gs1_128"
  | "code_39"
  | "code_93"
  | "ean_8"
  | "ean_13"
  | "upc_a"
  | "upc_e"
  | "itf"
  | "itf_14"
  | "codabar"
  | "gs1_databar";

export type PixelFormatPreference = "rgba8888" | "rgb888" | "gray8" | "yuv420";
/** Decoder ids are plugin-defined; the schema validates their portable id shape. */
export type DecoderId = string;
export type EnhancementId =
  | "contrast"
  | "gamma"
  | "invert"
  | "otsu"
  | "threshold-115"
  | "threshold-140"
  | "threshold-165"
  | "sharpen";
export type SemanticParserId =
  | "url"
  | "wifi"
  | "vcard"
  | "email"
  | "telephone"
  | "sms"
  | "geo"
  | "calendar"
  | "gs1"
  | "gs1-digital-link";

export interface ScenarioDefinition {
  schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  id: string;
  revision: number;
  description?: string;
  acceptedFormats: BarcodeFormat[];
  input: {
    preferredPixelFormats: PixelFormatPreference[];
    roi: { mode: "full-frame" | "relative"; x?: number; y?: number; width?: number; height?: number };
  };
  localization: {
    strategy: "edge-density" | "full-frame";
    maxCandidates: number;
    cropPaddings: Array<"tight" | "medium" | "expanded">;
    scales: number[];
  };
  enhancement: {
    operators: EnhancementId[];
    rotations: Array<0 | 90 | 180 | 270>;
  };
  decoders: {
    order: DecoderId[];
    execution: "sequential" | "parallel";
  };
  multiCode: { enabled: boolean; maxResults: number };
  duplicateSuppression: { enabled: boolean; windowMs: number };
  budgets: {
    maxPixels: number;
    maxCandidates: number;
    maxAttempts: number;
    maxIntermediateAllocations: number;
    maxIntermediateBytes: number;
    maxExecutionMs: number;
    maxConcurrentFrames: number;
  };
  validation: Array<{ id: string; required: boolean }>;
  semanticParsers: SemanticParserId[];
  quality: { minimumHeuristicQuality?: number };
  output: {
    includeRawBytes: boolean;
    includeDebugTrace: boolean;
    includeAttempts: boolean;
  };
  ablation: {
    localization: boolean;
    multiScale: boolean;
    enhancement: boolean;
    rotations: boolean;
    zxingFallback: boolean;
    splitImageFallback: boolean;
  };
}

export interface ScenarioValidationIssue {
  code: "required" | "type" | "range" | "enum" | "unsupported-version" | "duplicate";
  path: string;
  message: string;
}

export type ScenarioValidationResult =
  | { ok: true; value: ScenarioDefinition }
  | { ok: false; issues: ScenarioValidationIssue[]; message: string };

const FORMAT_VALUES = new Set<BarcodeFormat>([
  "qr_code", "micro_qr", "rmqr", "data_matrix", "gs1_data_matrix", "pdf417",
  "micro_pdf417", "aztec", "code_128", "gs1_128", "code_39", "code_93", "ean_8",
  "ean_13", "upc_a", "upc_e", "itf", "itf_14", "codabar", "gs1_databar",
]);
const PIXEL_VALUES = new Set<PixelFormatPreference>(["rgba8888", "rgb888", "gray8", "yuv420"]);
const PADDING_VALUES = new Set(["tight", "medium", "expanded"] as const);
const ENHANCEMENT_VALUES = new Set<EnhancementId>(["contrast", "gamma", "invert", "otsu", "threshold-115", "threshold-140", "threshold-165", "sharpen"]);
const PARSER_VALUES = new Set<SemanticParserId>(["url", "wifi", "vcard", "email", "telephone", "sms", "geo", "calendar", "gs1", "gs1-digital-link"]);

function recordArrayIssues<T extends string>(
  value: unknown,
  path: string,
  allowed: Set<T>,
  issues: ScenarioValidationIssue[],
  requireNonEmpty = true
): void {
  if (!Array.isArray(value)) {
    issues.push({ code: "type", path, message: `${path} must be an array.` });
    return;
  }
  if (requireNonEmpty && value.length === 0) {
    issues.push({ code: "required", path, message: `${path} must contain at least one value.` });
  }
  if (value.length > 64) issues.push({ code: "range", path, message: `${path} must contain at most 64 values.` });
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !allowed.has(entry as T)) {
      issues.push({ code: "enum", path: `${path}[${index}]`, message: `Unsupported value ${String(entry)}.` });
    }
    if (typeof entry === "string" && seen.has(entry)) {
      issues.push({ code: "duplicate", path: `${path}[${index}]`, message: `Duplicate value ${entry}.` });
    }
    if (typeof entry === "string") seen.add(entry);
  });
}

function decoderArrayIssues(value: unknown, path: string, issues: ScenarioValidationIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) { issues.push({ code: "required", path, message: `${path} must contain at least one decoder id.` }); return; }
  if (value.length > 16) issues.push({ code: "range", path, message: `${path} must contain at most 16 decoder ids.` });
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(entry)) issues.push({ code: "type", path: `${path}[${index}]`, message: "Decoder id must be 1-64 lowercase portable characters." });
    else if (seen.has(entry)) issues.push({ code: "duplicate", path: `${path}[${index}]`, message: `Duplicate value ${entry}.` });
    if (typeof entry === "string") seen.add(entry);
  });
}

function unknownKeys(value: unknown, path: string, allowed: readonly string[], issues: ScenarioValidationIssue[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) if (!allowed.includes(key)) issues.push({ code: "type", path: path === "$" ? key : `${path}.${key}`, message: `Unknown scenario field '${key}'.` });
}

function positiveInteger(value: unknown, path: string, issues: ScenarioValidationIssue[]): void {
  if (!Number.isInteger(value) || (value as number) < 1) {
    issues.push({ code: "range", path, message: `${path} must be a positive integer.` });
  }
}

function booleanValue(value: unknown, path: string, issues: ScenarioValidationIssue[]): void {
  if (typeof value !== "boolean") issues.push({ code: "type", path, message: `${path} must be a boolean.` });
}

export function validateScenario(input: unknown): ScenarioValidationResult {
  const issues: ScenarioValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, issues: [{ code: "type", path: "$", message: "Scenario must be an object." }], message: "Scenario must be an object." };
  }
  const value = input as Partial<ScenarioDefinition>;
  unknownKeys(value, "$", ["schemaVersion", "id", "revision", "description", "acceptedFormats", "input", "localization", "enhancement", "decoders", "multiCode", "duplicateSuppression", "budgets", "validation", "semanticParsers", "quality", "output", "ablation"], issues);
  unknownKeys(value.input, "input", ["preferredPixelFormats", "roi"], issues);
  unknownKeys(value.input?.roi, "input.roi", ["mode", "x", "y", "width", "height"], issues);
  unknownKeys(value.localization, "localization", ["strategy", "maxCandidates", "cropPaddings", "scales"], issues);
  unknownKeys(value.enhancement, "enhancement", ["operators", "rotations"], issues);
  unknownKeys(value.decoders, "decoders", ["order", "execution"], issues);
  unknownKeys(value.multiCode, "multiCode", ["enabled", "maxResults"], issues);
  unknownKeys(value.duplicateSuppression, "duplicateSuppression", ["enabled", "windowMs"], issues);
  unknownKeys(value.budgets, "budgets", ["maxPixels", "maxCandidates", "maxAttempts", "maxIntermediateAllocations", "maxIntermediateBytes", "maxExecutionMs", "maxConcurrentFrames"], issues);
  unknownKeys(value.quality, "quality", ["minimumHeuristicQuality"], issues);
  unknownKeys(value.output, "output", ["includeRawBytes", "includeDebugTrace", "includeAttempts"], issues);
  unknownKeys(value.ablation, "ablation", ["localization", "multiScale", "enhancement", "rotations", "zxingFallback", "splitImageFallback"], issues);
  if (value.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    issues.push({ code: "unsupported-version", path: "schemaVersion", message: `Expected scenario schema ${SCENARIO_SCHEMA_VERSION}; received ${String(value.schemaVersion)}.` });
  }
  if (typeof value.id !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(value.id)) {
    issues.push({ code: "type", path: "id", message: "id must be 2-64 lowercase letters, digits, dots, underscores, or hyphens." });
  }
  positiveInteger(value.revision, "revision", issues);
  if (value.description !== undefined && (typeof value.description !== "string" || value.description.length > 512)) issues.push({ code: "range", path: "description", message: "description must be a string of at most 512 characters." });
  recordArrayIssues(value.acceptedFormats, "acceptedFormats", FORMAT_VALUES, issues);
  recordArrayIssues(value.input?.preferredPixelFormats, "input.preferredPixelFormats", PIXEL_VALUES, issues);
  decoderArrayIssues(value.decoders?.order, "decoders.order", issues);
  recordArrayIssues(value.localization?.cropPaddings, "localization.cropPaddings", PADDING_VALUES, issues);
  recordArrayIssues(value.enhancement?.operators, "enhancement.operators", ENHANCEMENT_VALUES, issues, false);
  recordArrayIssues(value.semanticParsers, "semanticParsers", PARSER_VALUES, issues, false);
  if (value.localization?.strategy !== "edge-density" && value.localization?.strategy !== "full-frame") {
    issues.push({ code: "enum", path: "localization.strategy", message: "localization.strategy must be edge-density or full-frame." });
  }
  if (!Array.isArray(value.localization?.scales) || value.localization.scales.length === 0 || value.localization.scales.some((scale) => typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0 || scale > 4)) {
    issues.push({ code: "range", path: "localization.scales", message: "localization.scales must contain finite values greater than 0 and at most 4." });
  }
  if (!Array.isArray(value.enhancement?.rotations) || value.enhancement.rotations.length === 0 || value.enhancement.rotations.some((rotation) => ![0, 90, 180, 270].includes(rotation))) {
    issues.push({ code: "enum", path: "enhancement.rotations", message: "enhancement.rotations must contain only 0, 90, 180, or 270." });
  }
  positiveInteger(value.localization?.maxCandidates, "localization.maxCandidates", issues);
  booleanValue(value.multiCode?.enabled, "multiCode.enabled", issues);
  positiveInteger(value.multiCode?.maxResults, "multiCode.maxResults", issues);
  booleanValue(value.duplicateSuppression?.enabled, "duplicateSuppression.enabled", issues);
  if (!Number.isInteger(value.duplicateSuppression?.windowMs) || (value.duplicateSuppression?.windowMs ?? -1) < 0) issues.push({ code: "range", path: "duplicateSuppression.windowMs", message: "duplicateSuppression.windowMs must be a non-negative integer." });
  positiveInteger(value.budgets?.maxPixels, "budgets.maxPixels", issues);
  positiveInteger(value.budgets?.maxCandidates, "budgets.maxCandidates", issues);
  positiveInteger(value.budgets?.maxAttempts, "budgets.maxAttempts", issues);
  positiveInteger(value.budgets?.maxIntermediateAllocations, "budgets.maxIntermediateAllocations", issues);
  positiveInteger(value.budgets?.maxIntermediateBytes, "budgets.maxIntermediateBytes", issues);
  positiveInteger(value.budgets?.maxExecutionMs, "budgets.maxExecutionMs", issues);
  positiveInteger(value.budgets?.maxConcurrentFrames, "budgets.maxConcurrentFrames", issues);
  if (Number.isInteger(value.localization?.maxCandidates) && Number.isInteger(value.budgets?.maxCandidates) && value.localization!.maxCandidates > value.budgets!.maxCandidates) {
    issues.push({ code: "range", path: "localization.maxCandidates", message: "localization.maxCandidates must not exceed budgets.maxCandidates." });
  }
  if (Number.isInteger(value.multiCode?.maxResults) && Number.isInteger(value.budgets?.maxAttempts) && value.multiCode!.maxResults > value.budgets!.maxAttempts) {
    issues.push({ code: "range", path: "multiCode.maxResults", message: "multiCode.maxResults must not exceed budgets.maxAttempts." });
  }
  if (!Array.isArray(value.validation) || value.validation.some((validator) => !validator || typeof validator.id !== "string" || !validator.id || typeof validator.required !== "boolean")) {
    issues.push({ code: "type", path: "validation", message: "validation must contain objects with a non-empty id and boolean required flag." });
  }
  if (Array.isArray(value.validation)) {
    const ids = new Set<string>();
    if (value.validation.length > 32) issues.push({ code: "range", path: "validation", message: "validation must contain at most 32 validators." });
    value.validation.forEach((validator, index) => {
      if (validator && typeof validator === "object") unknownKeys(validator, `validation[${index}]`, ["id", "required"], issues);
      if (validator && typeof validator.id === "string") {
        if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(validator.id)) issues.push({ code: "type", path: `validation[${index}].id`, message: "Validator id must be a portable 1-64 character id." });
        if (ids.has(validator.id)) issues.push({ code: "duplicate", path: `validation[${index}].id`, message: `Duplicate validator '${validator.id}'.` });
        ids.add(validator.id);
      }
    });
  }
  const minimumQuality = value.quality?.minimumHeuristicQuality;
  if (minimumQuality !== undefined && (typeof minimumQuality !== "number" || !Number.isFinite(minimumQuality) || minimumQuality < 0 || minimumQuality > 1)) {
    issues.push({ code: "range", path: "quality.minimumHeuristicQuality", message: "quality.minimumHeuristicQuality must be between 0 and 1." });
  }
  for (const key of ["includeRawBytes", "includeDebugTrace", "includeAttempts"] as const) booleanValue(value.output?.[key], `output.${key}`, issues);
  for (const key of ["localization", "multiScale", "enhancement", "rotations", "zxingFallback", "splitImageFallback"] as const) booleanValue(value.ablation?.[key], `ablation.${key}`, issues);
  if (value.decoders?.execution !== "sequential" && value.decoders?.execution !== "parallel") {
    issues.push({ code: "enum", path: "decoders.execution", message: "decoders.execution must be sequential or parallel." });
  }
  if (value.input?.roi?.mode === "relative") {
    for (const key of ["x", "y", "width", "height"] as const) {
      const part = value.input.roi[key];
      const valid = typeof part === "number" && part >= 0 && part <= 1 && ((key === "width" || key === "height") ? part > 0 : true);
      if (!valid) issues.push({ code: "range", path: `input.roi.${key}`, message: `input.roi.${key} must be a relative value in the valid 0-1 range.` });
    }
    if (typeof value.input.roi.x === "number" && typeof value.input.roi.width === "number" && value.input.roi.x + value.input.roi.width > 1) issues.push({ code: "range", path: "input.roi.width", message: "ROI x + width must not exceed 1." });
    if (typeof value.input.roi.y === "number" && typeof value.input.roi.height === "number" && value.input.roi.y + value.input.roi.height > 1) issues.push({ code: "range", path: "input.roi.height", message: "ROI y + height must not exceed 1." });
  } else if (value.input?.roi?.mode !== "full-frame") {
    issues.push({ code: "enum", path: "input.roi.mode", message: "input.roi.mode must be full-frame or relative." });
  }
  if (issues.length) {
    return { ok: false, issues, message: issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n") };
  }
  return { ok: true, value: input as ScenarioDefinition };
}

const BASE_SCENARIO: ScenarioDefinition = {
  schemaVersion: SCENARIO_SCHEMA_VERSION,
  id: "balanced",
  revision: 1,
  acceptedFormats: ["qr_code"],
  input: { preferredPixelFormats: ["rgba8888", "rgb888", "gray8"], roi: { mode: "full-frame" } },
  localization: { strategy: "edge-density", maxCandidates: 5, cropPaddings: ["medium", "expanded", "tight"], scales: [1, 0.7, 1.35] },
  enhancement: { operators: ["contrast", "invert", "otsu", "threshold-140", "gamma", "sharpen", "threshold-115", "threshold-165"], rotations: [0, 90, 180, 270] },
  decoders: { order: ["jsqr", "zxing-js"], execution: "sequential" },
  multiCode: { enabled: true, maxResults: 8 },
  duplicateSuppression: { enabled: true, windowMs: 1_500 },
  budgets: { maxPixels: 8_000_000, maxCandidates: 5, maxAttempts: 96, maxIntermediateAllocations: 24, maxIntermediateBytes: 64 * 1024 * 1024, maxExecutionMs: 12_000, maxConcurrentFrames: 1 },
  validation: [],
  semanticParsers: ["url", "wifi", "vcard", "email", "telephone", "sms", "geo", "calendar", "gs1", "gs1-digital-link"],
  quality: {},
  output: { includeRawBytes: true, includeDebugTrace: false, includeAttempts: false },
  ablation: { localization: true, multiScale: true, enhancement: true, rotations: true, zxingFallback: true, splitImageFallback: true },
};

function cloneScenario<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const BUILTIN_SCENARIOS: Readonly<Record<"fast" | "balanced" | "robust", ScenarioDefinition>> = Object.freeze({
  fast: { ...cloneScenario(BASE_SCENARIO), id: "fast", localization: { ...BASE_SCENARIO.localization, maxCandidates: 2, cropPaddings: ["medium"], scales: [1] }, enhancement: { operators: ["contrast", "invert"], rotations: [0] }, multiCode: { enabled: false, maxResults: 1 }, budgets: { ...BASE_SCENARIO.budgets, maxPixels: 4_000_000, maxCandidates: 2, maxAttempts: 18, maxIntermediateAllocations: 8, maxIntermediateBytes: 24 * 1024 * 1024, maxExecutionMs: 2_000 }, semanticParsers: ["url"] },
  balanced: cloneScenario(BASE_SCENARIO),
  robust: { ...cloneScenario(BASE_SCENARIO), id: "robust", localization: { ...BASE_SCENARIO.localization, maxCandidates: 8 }, multiCode: { enabled: true, maxResults: 12 }, budgets: { ...BASE_SCENARIO.budgets, maxCandidates: 8, maxAttempts: 160, maxIntermediateAllocations: 40, maxIntermediateBytes: 96 * 1024 * 1024, maxExecutionMs: 20_000 } },
});

export type BuiltinScenarioId = keyof typeof BUILTIN_SCENARIOS;

export function getBuiltinScenario(id: BuiltinScenarioId): ScenarioDefinition {
  return cloneScenario(BUILTIN_SCENARIOS[id]);
}

export function migrateScenario(input: unknown): ScenarioValidationResult {
  return validateScenario(input);
}
