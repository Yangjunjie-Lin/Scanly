import { CaptureRouter, EngineRegistry, type CaptureRouterOptions } from "@scanly/core";
import { JsQrEngine } from "@scanly/engine-jsqr";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";
import { createZxingCppWasmEngine, type ZxingCppWasmEngineOptions } from "@scanly/engine-zxing-cpp-wasm";

/** Explicit browser composition root; core never imports concrete decoders. */
export interface BrowserCaptureRouterOptions extends Omit<CaptureRouterOptions, "engines"> {
  zxingCppWasm?: ZxingCppWasmEngineOptions | false;
}

export function createBrowserCaptureRouter(options: BrowserCaptureRouterOptions = {}): CaptureRouter {
  const { zxingCppWasm, ...routerOptions } = options;
  const engines = new EngineRegistry();
  engines.register(new JsQrEngine());
  if (zxingCppWasm !== false) engines.register(createZxingCppWasmEngine(zxingCppWasm));
  engines.register(new ZxingJsEngine());
  return new CaptureRouter({ ...routerOptions, engines });
}
