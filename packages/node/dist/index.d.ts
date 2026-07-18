import { CaptureRouter, EngineRegistry, type CaptureRouterOptions, type NormalizedFrame } from "@scanly/core";
import { type DecodeOutcome, type DecodePipelineOptions, type PipelineEngineExecutor, type PixelBuffer } from "@scanly/core/qr";
import { type ZxingCppWasmEngineOptions } from "@scanly/engine-zxing-cpp-wasm";
export declare function loadPixelBufferFromPath(filePath: string): Promise<PixelBuffer>;
export declare function loadNormalizedFrameFromPath(filePath: string, id?: string): Promise<NormalizedFrame>;
export interface NodeCaptureRouterOptions extends Omit<CaptureRouterOptions, "engines"> {
    zxingCppWasm?: ZxingCppWasmEngineOptions | false;
}
export declare function createNodeCaptureRouter(options?: NodeCaptureRouterOptions): CaptureRouter;
export declare function createNodeEngineRegistry(options?: {
    zxingCppWasm?: ZxingCppWasmEngineOptions | false;
}): EngineRegistry;
export declare function createNodePipelineEngineExecutor(engines?: EngineRegistry): PipelineEngineExecutor;
/** Lower-level algorithm adapter; canonical SDK benchmarks should use CaptureRouter. */
export declare function decodePixelBufferWithNodeEngines(image: PixelBuffer, options?: DecodePipelineOptions): Promise<DecodeOutcome>;
//# sourceMappingURL=index.d.ts.map