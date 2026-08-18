import { CaptureRouter, type CaptureRouterOptions } from "@scanly/core";
import { type ZxingCppWasmEngineOptions } from "@scanly/engine-zxing-cpp-wasm";
/** Explicit browser composition root; core never imports concrete decoders. */
export interface BrowserCaptureRouterOptions extends Omit<CaptureRouterOptions, "engines"> {
    zxingCppWasm?: ZxingCppWasmEngineOptions | false;
}
export declare function createBrowserCaptureRouter(options?: BrowserCaptureRouterOptions): CaptureRouter;
//# sourceMappingURL=runtime.d.ts.map