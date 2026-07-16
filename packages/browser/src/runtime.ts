import { CaptureRouter, EngineRegistry, type CaptureRouterOptions } from "@scanly/core";
import { JsQrEngine } from "@scanly/engine-jsqr";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";

/** Explicit browser composition root; core never imports concrete decoders. */
export function createBrowserCaptureRouter(options: Omit<CaptureRouterOptions, "engines"> = {}): CaptureRouter {
  const engines = new EngineRegistry();
  engines.register(new JsQrEngine());
  engines.register(new ZxingJsEngine());
  return new CaptureRouter({ ...options, engines });
}
