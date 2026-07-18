import type { BarcodeFormat } from "@scanly/scenario-schema";
import { SdkException, sdkError } from "../contracts/errors.js";
import type {
  DecoderEngine,
  EngineDecodeOptions,
  EngineOutcome,
  EngineRegistrationOptions,
  EngineRegistryContract,
} from "../contracts/engine.js";
import type { NormalizedFrame } from "../contracts/frame.js";

type EngineState = "registered" | "initializing" | "ready" | "failed" | "disposed";

interface EngineRecord {
  engine: DecoderEngine;
  state: EngineState;
  initializePromise?: Promise<void>;
  disposePromise?: Promise<void>;
  /** Instance-confined engines are serialized without blocking other engines. */
  tail: Promise<void>;
  active: Set<Promise<EngineOutcome>>;
}

function initializationFailure(engine: DecoderEngine, cause: unknown): SdkException {
  return new SdkException(sdkError(
    "engine_initialization_failure",
    `Decoder engine '${engine.id}' failed to initialize.`,
    { engineId: engine.id, engineVersion: engine.version },
    cause,
  ));
}

export class EngineRegistry implements EngineRegistryContract {
  private readonly records = new Map<string, EngineRecord>();
  private disposed = false;

  register(engine: DecoderEngine, options: EngineRegistrationOptions = {}): void {
    this.assertUsable();
    if (!engine || typeof engine.id !== "string" || !engine.id.trim()) {
      throw new SdkException(sdkError("invalid_configuration", "Decoder engine id must be a non-empty string."));
    }
    const prior = this.records.get(engine.id);
    if (prior && !options.replace) {
      throw new SdkException(sdkError("invalid_configuration", `Decoder engine '${engine.id}' is already registered.`, { engineId: engine.id }));
    }
    if (prior && prior.state !== "registered") {
      throw new SdkException(sdkError("invalid_configuration", `Initialized decoder engine '${engine.id}' cannot be replaced; unregister or dispose it first.`, { engineId: engine.id }));
    }
    this.records.set(engine.id, { engine, state: "registered", tail: Promise.resolve(), active: new Set() });
  }

  unregister(id: string): void {
    this.assertUsable();
    const record = this.records.get(id);
    if (!record) return;
    if (record.state !== "registered") {
      throw new SdkException(sdkError("invalid_configuration", `Decoder engine '${id}' is active and cannot be unregistered without disposal.`, { engineId: id }));
    }
    this.records.delete(id);
  }

  get(id: string): DecoderEngine | undefined {
    return this.records.get(id)?.engine;
  }

  list(): readonly DecoderEngine[] {
    return Object.freeze([...this.records.values()].map((record) => record.engine));
  }

  resolve(formats: readonly BarcodeFormat[]): readonly DecoderEngine[] {
    const requested = new Set(formats);
    return Object.freeze(this.list().filter((engine) => engine.capabilities.formats.some((format) => requested.has(format))));
  }

  async initializeAll(): Promise<void> {
    this.assertUsable();
    await Promise.all([...this.records.values()].map((record) => this.initialize(record)));
  }

  async decode(id: string, frame: NormalizedFrame, options: EngineDecodeOptions): Promise<EngineOutcome> {
    this.assertUsable();
    const record = this.records.get(id);
    if (!record) {
      throw new SdkException(sdkError("invalid_configuration", `Decoder engine '${id}' is not registered.`, { engineId: id }));
    }
    await this.initialize(record);
    this.assertUsable();
    if (record.state !== "ready") throw initializationFailure(record.engine, new Error("Engine is not ready."));

    const execute = async (): Promise<EngineOutcome> => {
      if (this.disposed || record.state === "disposed") {
        throw new SdkException(sdkError("session_disposed", `Decoder engine '${id}' has been disposed.`, { engineId: id }));
      }
      return record.engine.decode(frame, options);
    };
    const track = (operation: Promise<EngineOutcome>): Promise<EngineOutcome> => {
      record.active.add(operation);
      void operation.finally(() => record.active.delete(operation)).catch(() => undefined);
      return operation;
    };
    if (record.engine.capabilities.threadSafe) return track(execute());

    const previous = record.tail;
    let release!: () => void;
    record.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await track(execute());
    } finally {
      release();
    }
  }

  async disposeAll(): Promise<void> {
    if (this.disposed) {
      await Promise.all([...this.records.values()].map((record) => record.disposePromise));
      return;
    }
    this.disposed = true;
    await Promise.all([...this.records.values()].map(async (record) => {
      if (record.disposePromise) return record.disposePromise;
      record.disposePromise = (async () => {
        await record.initializePromise?.catch(() => undefined);
        await record.tail;
        await Promise.allSettled([...record.active]);
        if (record.state !== "disposed") await record.engine.dispose?.();
        record.state = "disposed";
      })();
      return record.disposePromise;
    }));
  }

  get isDisposed(): boolean { return this.disposed; }

  private async initialize(record: EngineRecord): Promise<void> {
    if (record.state === "ready") return;
    if (record.state === "disposed" || this.disposed) this.assertUsable();
    if (!record.initializePromise) {
      record.state = "initializing";
      const promise = Promise.resolve()
        .then(() => record.engine.initialize?.())
        .then(() => { record.state = "ready"; })
        .catch((cause) => {
          record.state = "failed";
          throw initializationFailure(record.engine, cause);
        })
        .finally(() => {
          // Failed engines may define their own bounded retry/circuit-breaker policy.
          // Clearing only the failed promise preserves in-flight deduplication while
          // allowing a later decode to make one explicit retry.
          if (record.state === "failed" && record.initializePromise === promise) record.initializePromise = undefined;
        });
      record.initializePromise = promise;
    }
    await record.initializePromise;
  }

  private assertUsable(): void {
    if (this.disposed) throw new SdkException(sdkError("session_disposed", "Decoder engine registry has been disposed."));
  }
}
