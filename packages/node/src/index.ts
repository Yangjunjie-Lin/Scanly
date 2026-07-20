import sharp from "sharp";
import {
  CaptureRouter,
  EngineRegistry,
  createRgbaFrame,
  type CaptureRouterOptions,
  type NormalizedFrame,
} from "@scanly/core";
import { createPixelBuffer, decodePixelBuffer, flattenAlphaOntoWhite, type DecodeOutcome, type DecodePipelineOptions, type PipelineEngineExecutor, type PixelBuffer } from "@scanly/core/qr";
import { JsQrEngine } from "@scanly/engine-jsqr";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";
import { createZxingCppWasmEngine, type ZxingCppWasmEngineOptions } from "@scanly/engine-zxing-cpp-wasm";

export async function loadPixelBufferFromPath(filePath: string): Promise<PixelBuffer> {
  try {
    const { data, info } = await sharp(filePath).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width < 1 || info.height < 1) throw Object.assign(new Error("Image has no pixel data."), { code: "empty_image" as const });
    return flattenAlphaOntoWhite(createPixelBuffer(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) throw error;
    throw Object.assign(new Error("Unsupported or corrupted image."), { code: "unsupported_image" as const, cause: error });
  }
}

export async function loadNormalizedFrameFromPath(filePath: string, id?: string): Promise<NormalizedFrame> {
  const pixels = await loadPixelBufferFromPath(filePath);
  return createRgbaFrame(pixels.data, pixels.width, pixels.height, { id, sourceType: "upload", ownership: "owned" });
}

export interface NodeCaptureRouterOptions extends Omit<CaptureRouterOptions, "engines"> {
  zxingCppWasm?: ZxingCppWasmEngineOptions | false;
}

export function createNodeCaptureRouter(options: NodeCaptureRouterOptions = {}): CaptureRouter {
  const { zxingCppWasm, ...routerOptions } = options;
  const engines = createNodeEngineRegistry({ zxingCppWasm });
  return new CaptureRouter({ ...routerOptions, engines });
}

export function createNodeEngineRegistry(options: { zxingCppWasm?: ZxingCppWasmEngineOptions | false } = {}): EngineRegistry {
  const engines = new EngineRegistry();
  engines.register(new JsQrEngine());
  if (options.zxingCppWasm !== false) engines.register(createZxingCppWasmEngine(options.zxingCppWasm));
  engines.register(new ZxingJsEngine());
  return engines;
}

export function createNodePipelineEngineExecutor(engines: EngineRegistry = createNodeEngineRegistry()): PipelineEngineExecutor {
  return {
    engineIds: engines.list().map((engine) => engine.id),
    versions: Object.fromEntries(engines.list().map((engine) => [engine.id, engine.version])),
    decode: (engineId, image, options) => engines.decode(engineId, createRgbaFrame(image.data, image.width, image.height), { formats: options.formats, findMultiple: options.findMultiple, signal: options.signal, inversion: options.inversion }),
  };
}

/** Lower-level algorithm adapter; canonical SDK benchmarks should use CaptureRouter. */
export async function decodePixelBufferWithNodeEngines(image: PixelBuffer, options: DecodePipelineOptions = {}): Promise<DecodeOutcome> {
  const engines = createNodeEngineRegistry();
  try {
    return await decodePixelBuffer(image, {
      ...options,
      engineExecutor: createNodePipelineEngineExecutor(engines),
      config: { ...options.config, decoders: options.config?.decoders ?? { order: ["jsqr", "zxing-cpp-wasm", "zxing-js"], execution: "sequential" } },
    });
  } finally {
    await engines.disposeAll();
  }
}
