import { parseSemanticPayload, type StructuredPayload } from "@scanly/parsers";
import { getBuiltinScenario, validateScenario, type ScenarioDefinition, type SemanticParserId } from "@scanly/scenario-schema";
import { sdkError, type SdkErrorCode } from "../contracts/errors.js";
import { bytesPerPixel, validateFrame, type NormalizedFrame } from "../contracts/frame.js";
import type { Operator, OperatorContext } from "../contracts/operator.js";
import type { DebugTraceEvent, ScanFailure, ScanOutcome, ScanResult, ScanSuccess, ScanTiming } from "../contracts/result.js";
import { cropBuffer } from "../qr/region-detection.js";
import { decodePixelBuffer } from "../qr/decode-pipeline.js";
import type { DecodeErrorReason, DecodeOutcome, PixelBuffer, PipelineConfig, PreprocessMethod } from "../qr/types.js";
import { BoundedFrameArtifactStore } from "./artifacts.js";

const ENGINE_VERSIONS: Record<string, string> = { jsqr: "1.4.0", zxing: "0.21.3" };

function legacyError(reason: DecodeErrorReason): SdkErrorCode {
  const mapping: Partial<Record<DecodeErrorReason, SdkErrorCode>> = {
    no_qr_found: "no_symbol_found",
    invalid_file: "invalid_image",
    unsupported_image: "invalid_image",
    invalid_image: "invalid_image",
    invalid_configuration: "invalid_configuration",
    empty_image: "invalid_image",
    image_too_large: "resource_limit_exceeded",
    timeout: "timeout",
    cancelled: "cancelled",
    worker_error: "engine_execution_failure",
    worker_initialization_failure: "worker_initialization_failure",
    camera_permission_denied: "camera_permission_denied",
    no_camera: "camera_unavailable",
  };
  return mapping[reason] ?? "engine_execution_failure";
}

export function scenarioToPipelineConfig(scenario: ScenarioDefinition): Partial<PipelineConfig> {
  const enhancements: PreprocessMethod[] = scenario.ablation.enhancement
    ? ["original", ...scenario.enhancement.operators]
    : ["original"];
  return {
    maxCandidates: Math.min(scenario.localization.maxCandidates, scenario.budgets.maxCandidates),
    maxAttempts: scenario.budgets.maxAttempts,
    timeoutMs: scenario.budgets.maxExecutionMs,
    maxPixels: scenario.budgets.maxPixels,
    findMultiple: scenario.multiCode.enabled,
    maxMultipleResults: scenario.multiCode.maxResults,
    scales: scenario.ablation.multiScale ? scenario.localization.scales : [1],
    paddings: scenario.localization.cropPaddings,
    rotations: scenario.ablation.rotations ? scenario.enhancement.rotations : [0],
    preprocessOrder: enhancements,
    decoders: {
      jsqr: scenario.decoders.order.includes("jsqr"),
      zxing: scenario.ablation.zxingFallback && scenario.decoders.order.includes("zxing-js"),
      decoderOrder: scenario.decoders.order.flatMap((id) => id === "jsqr" ? ["jsqr" as const] : id === "zxing-js" ? ["zxing" as const] : []),
    },
    enableLocalization: scenario.ablation.localization,
    enableSplitImageFallback: scenario.ablation.splitImageFallback,
    maxIntermediateAllocations: scenario.budgets.maxIntermediateAllocations,
    maxIntermediateBytes: scenario.budgets.maxIntermediateBytes,
  };
}

function rgbaFromFrame(frame: NormalizedFrame): PixelBuffer {
  const bpp = bytesPerPixel(frame.pixelFormat);
  if (frame.pixelFormat === "yuv420" || bpp === null) {
    throw Object.assign(new Error("YUV input is represented by the frame contract but no YUV converter is registered."), { code: "unsupported_format" });
  }
  if (frame.pixelFormat === "rgba8888" && frame.rowStride === frame.width * 4) {
    const source = frame.data;
    const data = source instanceof Uint8ClampedArray
      ? source
      : new Uint8ClampedArray(source.buffer, source.byteOffset, source.byteLength);
    return { data, width: frame.width, height: frame.height };
  }
  const output = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y++) {
    const row = y * frame.rowStride;
    for (let x = 0; x < frame.width; x++) {
      const source = row + x * bpp;
      const target = (y * frame.width + x) * 4;
      if (frame.pixelFormat === "gray8") {
        output[target] = output[target + 1] = output[target + 2] = frame.data[source];
      } else {
        output[target] = frame.data[source];
        output[target + 1] = frame.data[source + 1];
        output[target + 2] = frame.data[source + 2];
      }
      output[target + 3] = frame.pixelFormat === "rgba8888" ? frame.data[source + 3] : 255;
    }
  }
  return { data: output, width: frame.width, height: frame.height };
}

function applyRoi(buffer: PixelBuffer, scenario: ScenarioDefinition): PixelBuffer {
  const roi = scenario.input.roi;
  if (roi.mode !== "relative") return buffer;
  const x = Math.floor((roi.x ?? 0) * buffer.width);
  const y = Math.floor((roi.y ?? 0) * buffer.height);
  const width = Math.max(1, Math.floor((roi.width ?? 1) * buffer.width));
  const height = Math.max(1, Math.floor((roi.height ?? 1) * buffer.height));
  return cropBuffer(buffer, { x, y, width: Math.min(width, buffer.width - x), height: Math.min(height, buffer.height - y) });
}

function parserEnabled(structured: StructuredPayload | null, enabled: SemanticParserId[]): StructuredPayload | null {
  if (!structured) return null;
  const idByKind: Record<StructuredPayload["kind"], SemanticParserId> = {
    url: "url", wifi: "wifi", vcard: "vcard", email: "email", telephone: "telephone", sms: "sms", geo: "geo",
    calendar: "calendar", "gs1-element-string": "gs1", "gs1-digital-link": "gs1-digital-link",
  };
  return enabled.includes(idByKind[structured.kind]) ? structured : null;
}

function timingFromLegacy(outcome: DecodeOutcome): ScanTiming {
  const phase = outcome.phaseTiming;
  return {
    totalMs: outcome.elapsedMs,
    ...(outcome.ok && outcome.timeToFirstResultMs !== undefined ? { timeToFirstResultMs: outcome.timeToFirstResultMs } : {}),
    candidateGenerationMs: phase?.candidateGenerationMs,
    preprocessingMs: phase?.preprocessMs,
    rotationMs: phase?.rotationMs,
    decodingMs: phase ? phase.jsqrMs + phase.zxingMs : undefined,
    workerSetupMs: phase?.workerSetupMs,
    workerTransferMs: phase?.workerTransferMs,
  };
}

function failure(frameId: string, scenarioId: string, code: SdkErrorCode, message: string, attemptCount: number, timing: ScanTiming, trace?: DebugTraceEvent[], cause?: unknown): ScanFailure {
  return { ok: false, error: sdkError(code, message, undefined, cause), frameId, scenarioId, attemptCount, timing, ...(trace ? { trace } : {}) };
}

export function mapLegacyQrOutcome(
  frameId: string,
  scenario: ScenarioDefinition,
  outcome: DecodeOutcome,
  trace?: DebugTraceEvent[]
): ScanOutcome {
  const timing = timingFromLegacy(outcome);
  const traceOutput = scenario.output.includeDebugTrace ? trace : undefined;
  if (!outcome.ok) return failure(frameId, scenario.id, legacyError(outcome.reason), outcome.message, outcome.attemptCount, timing, traceOutput);
  if (outcome.results.length === 0) return failure(frameId, scenario.id, "internal_invariant_failure", "QR pipeline returned an empty success result.", outcome.attemptCount, timing, traceOutput);
  const results = outcome.results.map((code): ScanResult => {
    const semantic = parseSemanticPayload(code.payload);
    const requiredValidators = scenario.validation.filter((validator) => validator.required);
    const validatorMessages = requiredValidators.map((validator) => `Required validator '${validator.id}' is not registered.`);
    return {
      format: "qr_code",
      rawText: code.payload,
      ...(scenario.output.includeRawBytes && code.rawBytes ? { rawBytes: code.rawBytes } : {}),
      orientation: code.rotation,
      engine: { id: code.decoder === "zxing" ? "zxing-js" : "jsqr", version: ENGINE_VERSIONS[code.decoder] },
      preprocessingPath: [code.preprocessing],
      candidate: { index: code.candidateIndex, padding: code.cropPadding, scale: code.scale, rotation: code.rotation },
      frameId,
      structuredPayload: parserEnabled(semantic.structured, scenario.semanticParsers),
      validation: { valid: validatorMessages.length === 0, validatorIds: scenario.validation.map((validator) => validator.id), messages: validatorMessages },
      warnings: [...(semantic.structured?.warnings ?? []), ...(outcome.cancelled ? ["Capture was cancelled after at least one result was decoded."] : [])],
      timing,
    };
  });
  if (!results.length) return failure(frameId, scenario.id, "internal_invariant_failure", "Result aggregation produced an empty success result.", outcome.attemptCount, timing, traceOutput);
  const nonEmpty = results as ScanSuccess["results"];
  return { ok: true, results: nonEmpty, primary: nonEmpty[0], frameId, scenarioId: scenario.id, attemptCount: outcome.attemptCount, timing, ...(traceOutput ? { trace: traceOutput } : {}) };
}

export function createExternalTextOutcome(
  frameId: string,
  scenario: ScenarioDefinition,
  text: string,
  engine: { id: string; version: string },
  elapsedMs: number
): ScanOutcome {
  const normalized = text.replace(/\u0000/g, "").trimEnd();
  if (!normalized) return failure(frameId, scenario.id, "no_symbol_found", "Decoder returned an empty payload.", 1, { totalMs: elapsedMs });
  const semantic = parseSemanticPayload(normalized);
  const result: ScanResult = {
    format: "qr_code",
    rawText: normalized,
    engine,
    preprocessingPath: ["camera-frame"],
    frameId,
    structuredPayload: parserEnabled(semantic.structured, scenario.semanticParsers),
    validation: { valid: scenario.validation.every((validator) => !validator.required), validatorIds: scenario.validation.map((validator) => validator.id), messages: scenario.validation.filter((validator) => validator.required).map((validator) => `Required validator '${validator.id}' is not registered.`) },
    warnings: semantic.structured?.warnings ?? [],
    timing: { totalMs: elapsedMs, timeToFirstResultMs: elapsedMs },
  };
  return { ok: true, results: [result], primary: result, frameId, scenarioId: scenario.id, attemptCount: 1, timing: result.timing };
}

export interface CaptureRouterOptions { scenario?: ScenarioDefinition; now?: () => number }

class QrPipelineOperator implements Operator<PixelBuffer, DecodeOutcome, { scenario: ScenarioDefinition }> {
  readonly descriptor = {
    id: "scanly.qr-pipeline",
    version: "2.0.0-alpha.1",
    accepts: ["pixel-buffer.rgba8888"],
    produces: ["decode-outcome.qr"],
    configurationSchemaId: "https://scanly.dev/schema/scenario/2.0",
    cost: { cpu: "high" as const, memoryBytes: 64 * 1024 * 1024, attempts: 96 },
    cancellation: "cooperative" as const,
    behavior: "deterministic" as const,
    threadSafety: "thread-safe" as const,
  };
  execute(input: PixelBuffer, configuration: { scenario: ScenarioDefinition }, context: OperatorContext): Promise<DecodeOutcome> {
    return decodePixelBuffer(input, {
      signal: context.signal,
      config: scenarioToPipelineConfig(configuration.scenario),
      onStage: (stage) => context.trace("qr.pipeline", stage),
      onProgress: ({ attemptCount }) => context.trace("qr.attempt", String(attemptCount)),
    });
  }
}

export class CaptureRouter {
  private scenario: ScenarioDefinition;
  private readonly now: () => number;
  private readonly qrOperator = new QrPipelineOperator();
  private activeFrames = 0;
  constructor(options: CaptureRouterOptions = {}) {
    this.scenario = options.scenario ?? getBuiltinScenario("balanced");
    this.now = options.now ?? (() => Date.now());
  }
  updateScenario(scenario: ScenarioDefinition): void {
    const validated = validateScenario(scenario);
    if (!validated.ok) throw Object.assign(new Error(validated.message), { code: "malformed_scenario", issues: validated.issues });
    this.scenario = validated.value;
  }
  getScenario(): ScenarioDefinition { return JSON.parse(JSON.stringify(this.scenario)) as ScenarioDefinition; }

  async scan(frame: NormalizedFrame, options: { signal?: AbortSignal; scenario?: ScenarioDefinition } = {}): Promise<ScanOutcome> {
    const scenario = options.scenario ?? this.scenario;
    const frameId = frame && typeof frame === "object" && typeof frame.id === "string" && frame.id ? frame.id : "invalid-frame";
    const started = this.now();
    const trace: DebugTraceEvent[] = [];
    const record = (stage: string, detail?: string) => trace.push({ atMs: this.now() - started, stage, ...(detail ? { detail } : {}) });
    const traceOutput = () => scenario.output?.includeDebugTrace ? trace : undefined;
    const validation = validateScenario(scenario);
    if (!validation.ok) return failure(frameId, scenario.id || "invalid", "malformed_scenario", validation.message, 0, { totalMs: this.now() - started }, traceOutput());
    const frameIssues = validateFrame(frame);
    if (frameIssues.length) return failure(frameId, scenario.id, "invalid_image", frameIssues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"), 0, { totalMs: this.now() - started }, traceOutput());
    if (!scenario.acceptedFormats.includes("qr_code")) return failure(frameId, scenario.id, "unsupported_format", "No installed engine supports the scenario's accepted formats. This preview implements QR Code Model 2 only.", 0, { totalMs: this.now() - started }, traceOutput());
    if (frame.width * frame.height > scenario.budgets.maxPixels) return failure(frameId, scenario.id, "resource_limit_exceeded", `Frame has ${frame.width * frame.height} pixels; scenario limit is ${scenario.budgets.maxPixels}.`, 0, { totalMs: this.now() - started }, traceOutput());
    if (this.activeFrames >= scenario.budgets.maxConcurrentFrames) return failure(frameId, scenario.id, "concurrent_call_rejected", `Router concurrency limit is ${scenario.budgets.maxConcurrentFrames} frame(s).`, 0, { totalMs: this.now() - started }, traceOutput());

    const artifacts = new BoundedFrameArtifactStore(scenario.budgets.maxIntermediateAllocations, scenario.budgets.maxIntermediateBytes);
    const timeout = new AbortController();
    const onAbort = () => timeout.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const timeoutId = setTimeout(() => timeout.abort(), scenario.budgets.maxExecutionMs);
    this.activeFrames += 1;
    try {
      record("frame.accepted", `${frame.pixelFormat} ${frame.width}x${frame.height}`);
      const normalized = applyRoi(rgbaFromFrame(frame), scenario);
      const estimatedBytes = normalized.data.byteLength;
      artifacts.set("frame.rgba", normalized, frame.ownership === "borrowed" && normalized.data === frame.data ? 0 : estimatedBytes);
      const context: OperatorContext = { signal: timeout.signal, artifacts, trace: record };
      const outcome = await this.qrOperator.execute(normalized, { scenario }, context);
      return mapLegacyQrOutcome(frameId, scenario, outcome, trace);
    } catch (error) {
      const code = options.signal?.aborted ? "cancelled" : timeout.signal.aborted ? "timeout" : (error as { code?: string })?.code === "resource_limit_exceeded" ? "resource_limit_exceeded" : (error as { code?: string })?.code === "unsupported_format" ? "unsupported_format" : "engine_execution_failure";
      return failure(frameId, scenario.id, code, error instanceof Error ? error.message : String(error), 0, { totalMs: this.now() - started }, traceOutput(), error);
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onAbort);
      artifacts.dispose();
      if (frame.ownership !== "borrowed") frame.dispose?.();
      this.activeFrames -= 1;
    }
  }
}
