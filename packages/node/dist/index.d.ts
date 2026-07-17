import { CaptureRouter, EngineRegistry, type CaptureRouterOptions, type NormalizedFrame } from "@scanly/core";
import { type DecodeOutcome, type DecodePipelineOptions, type PipelineEngineExecutor, type PixelBuffer } from "@scanly/core/qr";
export declare function loadPixelBufferFromPath(filePath: string): Promise<PixelBuffer>;
export declare function loadNormalizedFrameFromPath(filePath: string, id?: string): Promise<NormalizedFrame>;
export declare function createNodeCaptureRouter(options?: Omit<CaptureRouterOptions, "engines">): CaptureRouter;
export declare function createNodeEngineRegistry(): EngineRegistry;
export declare function createNodePipelineEngineExecutor(engines?: EngineRegistry): PipelineEngineExecutor;
/** Lower-level algorithm adapter; canonical SDK benchmarks should use CaptureRouter. */
export declare function decodePixelBufferWithNodeEngines(image: PixelBuffer, options?: DecodePipelineOptions): Promise<DecodeOutcome>;
//# sourceMappingURL=index.d.ts.map