import { CaptureRouter, EngineRegistry } from "@scanly/core";
import { JsQrEngine } from "@scanly/engine-jsqr";
import { ZxingJsEngine } from "@scanly/engine-zxing-js";
import { createZxingCppWasmEngine } from "@scanly/engine-zxing-cpp-wasm";
export function createBrowserCaptureRouter(options = {}) {
    const { zxingCppWasm, ...routerOptions } = options;
    const engines = new EngineRegistry();
    engines.register(new JsQrEngine());
    if (zxingCppWasm !== false)
        engines.register(createZxingCppWasmEngine(zxingCppWasm));
    engines.register(new ZxingJsEngine());
    return new CaptureRouter({ ...routerOptions, engines });
}
//# sourceMappingURL=runtime.js.map