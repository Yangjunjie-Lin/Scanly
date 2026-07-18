import {
  getZXingModule,
  prepareZXingModule,
  purgeZXingModule,
  type ZXingReaderModule,
} from "zxing-wasm/reader";
import { detectRuntimeKind, supportsWasmSimd, supportsWebAssembly } from "./capability.js";
import { ZXING_CPP_WASM_BUILD_METADATA } from "./metadata.js";
import type {
  ZxingCppWasmAsset,
  ZxingCppWasmBuildMetadata,
  ZxingCppWasmEngineOptions,
  ZxingCppWasmErrorCode,
  ZxingCppWasmInitializationState,
  ZxingCppWasmVariant,
} from "./types.js";

const metadata: ZxingCppWasmBuildMetadata = ZXING_CPP_WASM_BUILD_METADATA;

export class ZxingCppWasmError extends Error {
  readonly code: ZxingCppWasmErrorCode;
  readonly retryable: boolean;
  readonly cause?: unknown;
  constructor(code: ZxingCppWasmErrorCode, message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = "ZxingCppWasmError";
    this.code = code;
    this.retryable = options.retryable ?? ["asset_not_found", "initialization_timeout"].includes(code);
    this.cause = options.cause;
  }
}

interface SharedModule {
  key: string;
  promise: Promise<ZXingReaderModule>;
  module?: ZXingReaderModule;
  references: number;
}

let sharedModule: SharedModule | null = null;

function toBytes(asset: Uint8Array | ArrayBuffer): Uint8Array {
  return asset instanceof Uint8Array ? asset : new Uint8Array(asset);
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new ZxingCppWasmError("unsupported_runtime", "SHA-256 is unavailable in this runtime.");
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readAsset(asset: ZxingCppWasmAsset): Promise<Uint8Array> {
  if (asset instanceof Uint8Array || asset instanceof ArrayBuffer) return toBytes(asset);
  const url = asset instanceof URL ? asset : new URL(asset, import.meta.url);
  if (url.protocol === "file:") {
    if (detectRuntimeKind() !== "node") throw new ZxingCppWasmError("asset_not_found", "file: WASM assets are supported only in Node.");
    try {
      // Avoid a static node: import in the shared module graph: Webpack/Next
      // otherwise attempts to bundle it for Browser and Worker consumers.
      const nodeProcess = (globalThis as unknown as {
        process?: { getBuiltinModule?: (specifier: string) => unknown };
      }).process;
      const fileSystem = nodeProcess?.getBuiltinModule?.("node:fs") as {
        promises?: { readFile(file: URL): Promise<Uint8Array> };
      } | undefined;
      if (!fileSystem?.promises?.readFile) {
        throw new ZxingCppWasmError("unsupported_runtime", "This Node runtime cannot resolve the local WASM asset without a static browser-visible import.");
      }
      return new Uint8Array(await fileSystem.promises.readFile(url));
    } catch (cause) {
      if (cause instanceof ZxingCppWasmError) throw cause;
      throw new ZxingCppWasmError("asset_not_found", `Unable to read WASM asset '${url.href}'.`, { cause });
    }
  }
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw new ZxingCppWasmError("asset_not_found", `Unable to fetch WASM asset '${url.href}'.`, { cause });
  }
}

function defaultAsset(variant: ZxingCppWasmVariant): URL {
  if (variant === "simd") {
    throw new ZxingCppWasmError("unsupported_simd", "The packaged SIMD WASM asset is unavailable.");
  }
  // Keep this literal for bundlers that recognize the standard
  // `new URL(asset, import.meta.url)` separately-cacheable asset pattern.
  return new URL("../wasm/zxing-cpp.wasm", import.meta.url);
}

function mapInstantiationError(error: unknown): ZxingCppWasmError {
  if (error instanceof ZxingCppWasmError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const code: ZxingCppWasmErrorCode = /compile|magic word|section|WebAssembly\.CompileError/i.test(message)
    ? "wasm_compile_failed"
    : "wasm_instantiate_failed";
  return new ZxingCppWasmError(code, `ZXing-C++ WASM initialization failed: ${message.slice(0, 1_024)}`, { cause: error });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new ZxingCppWasmError("initialization_timeout", `WASM initialization exceeded ${timeoutMs}ms.`, { retryable: true })), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class ZxingCppWasmLoader {
  private state: ZxingCppWasmInitializationState = "uninitialized";
  private initializationPromise?: Promise<void>;
  private module?: ZXingReaderModule;
  private variant: ZxingCppWasmVariant | null = null;
  private attempts = 0;
  private acquired = false;
  private initializedAtMs: number | null = null;

  constructor(private readonly options: ZxingCppWasmEngineOptions = {}) {}

  get initializationState(): ZxingCppWasmInitializationState { return this.state; }
  get selectedVariant(): ZxingCppWasmVariant | null { return this.variant; }
  get initializationMs(): number | null { return this.initializedAtMs; }
  get buildMetadata(): ZxingCppWasmBuildMetadata { return metadata; }
  get readerModule(): ZXingReaderModule {
    if (this.state === "disposed") throw new ZxingCppWasmError("disposed", "ZXing-C++ WASM loader has been disposed.");
    if (this.state !== "ready" || !this.module) throw new ZxingCppWasmError("wasm_instantiate_failed", "ZXing-C++ WASM is not initialized.");
    return this.module;
  }

  initialize(): Promise<void> {
    if (this.state === "disposed") return Promise.reject(new ZxingCppWasmError("disposed", "ZXing-C++ WASM loader has been disposed."));
    if (this.state === "ready") return Promise.resolve();
    if (this.initializationPromise) return this.initializationPromise;
    const maximumAttempts = Math.max(1, Math.min(5, this.options.maxInitializationAttempts ?? 2));
    if (this.state === "failed" && this.attempts >= maximumAttempts) {
      return Promise.reject(new ZxingCppWasmError("wasm_instantiate_failed", `ZXing-C++ WASM initialization circuit is open after ${this.attempts} failed attempts.`));
    }
    this.initializationPromise = this.initializeOnce()
      .catch((error) => {
        this.state = "failed";
        throw mapInstantiationError(error);
      })
      .finally(() => { this.initializationPromise = undefined; });
    return this.initializationPromise;
  }

  private async initializeOnce(): Promise<void> {
    this.state = "loading";
    this.attempts += 1;
    if (!supportsWebAssembly()) throw new ZxingCppWasmError("unsupported_runtime", "WebAssembly is unavailable in this runtime.");
    detectRuntimeKind();
    const preference = this.options.variant ?? "auto";
    const simdSupported = supportsWasmSimd();
    if (preference === "simd" && !simdSupported) throw new ZxingCppWasmError("unsupported_simd", "The requested SIMD WASM variant is unsupported.");
    const selected: ZxingCppWasmVariant = preference === "standard"
      ? "standard"
      : preference === "simd"
        ? "simd"
        : simdSupported && metadata.assets.simd.available ? "simd" : "standard";
    const assetMetadata = metadata.assets[selected];
    if (!assetMetadata.available || !assetMetadata.sha256) throw new ZxingCppWasmError(selected === "simd" ? "unsupported_simd" : "asset_not_found", `${selected} WASM asset is not available.`);
    const resolved = await (this.options.assetResolver?.(selected, metadata) ?? defaultAsset(selected));
    const bytes = await readAsset(resolved);
    if (this.options.verifyAssetIntegrity !== false) {
      const actual = await sha256(bytes);
      if (actual !== assetMetadata.sha256) throw new ZxingCppWasmError("asset_integrity_failed", `WASM SHA-256 mismatch for ${selected}; expected ${assetMetadata.sha256}, received ${actual}.`);
    }
    const wasmBinary = bytes.slice().buffer as ArrayBuffer;
    if (!WebAssembly.validate(wasmBinary)) throw new ZxingCppWasmError("wasm_compile_failed", `The ${selected} asset is not a valid WebAssembly module.`);
    const key = `${selected}:${assetMetadata.sha256}`;
    const started = performance.now();
    if (sharedModule && sharedModule.key !== key) throw new ZxingCppWasmError("wasm_instantiate_failed", "A different ZXing-C++ WASM variant is already active in this JavaScript realm.");
    if (!sharedModule) {
      const promise = Promise.resolve(prepareZXingModule({
        fireImmediately: true,
        overrides: { wasmBinary, locateFile: () => defaultAsset(selected).href },
      })).then((module) => {
        if (!module) throw new Error("Emscripten returned no reader module.");
        if (sharedModule?.key === key) sharedModule.module = module;
        return module;
      });
      sharedModule = { key, promise, references: 0 };
    }
    try {
      this.module = await withTimeout(sharedModule.promise, Math.max(100, Math.min(60_000, this.options.initializationTimeoutMs ?? 10_000)));
    } catch (error) {
      if (sharedModule?.key === key && sharedModule.references === 0) {
        sharedModule = null;
        purgeZXingModule();
      }
      throw error;
    }
    sharedModule.references += 1;
    this.acquired = true;
    this.variant = selected;
    this.initializedAtMs = performance.now() - started;
    this.state = "ready";
  }

  async dispose(): Promise<void> {
    if (this.state === "disposed") return;
    await this.initializationPromise?.catch(() => undefined);
    if (this.acquired && sharedModule) {
      sharedModule.references = Math.max(0, sharedModule.references - 1);
      if (sharedModule.references === 0) {
        sharedModule = null;
        purgeZXingModule();
      }
    }
    this.acquired = false;
    this.module = undefined;
    this.state = "disposed";
  }
}
