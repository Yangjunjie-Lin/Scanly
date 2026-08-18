import { SdkException, sdkError } from "../contracts/errors.js";
function initializationFailure(engine, cause) {
    return new SdkException(sdkError("engine_initialization_failure", `Decoder engine '${engine.id}' failed to initialize.`, { engineId: engine.id, engineVersion: engine.version }, cause));
}
export class EngineRegistry {
    records = new Map();
    disposed = false;
    register(engine, options = {}) {
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
    unregister(id) {
        this.assertUsable();
        const record = this.records.get(id);
        if (!record)
            return;
        if (record.state !== "registered") {
            throw new SdkException(sdkError("invalid_configuration", `Decoder engine '${id}' is active and cannot be unregistered without disposal.`, { engineId: id }));
        }
        this.records.delete(id);
    }
    get(id) {
        return this.records.get(id)?.engine;
    }
    list() {
        return Object.freeze([...this.records.values()].map((record) => record.engine));
    }
    resolve(formats) {
        const requested = new Set(formats);
        if (requested.size === 0)
            throw new SdkException(sdkError("unsupported_format", "At least one barcode format must be requested."));
        const resolved = this.list().filter((engine) => engine.capabilities.formats.some((format) => requested.has(format)));
        if (!resolved.length)
            throw new SdkException(sdkError("unsupported_format", `No registered engine supports: ${[...requested].join(", ")}.`));
        return Object.freeze(resolved);
    }
    async initializeAll() {
        this.assertUsable();
        await Promise.all([...this.records.values()].map((record) => this.initialize(record)));
    }
    async decode(id, frame, options) {
        this.assertUsable();
        const record = this.records.get(id);
        if (!record) {
            throw new SdkException(sdkError("invalid_configuration", `Decoder engine '${id}' is not registered.`, { engineId: id }));
        }
        await this.initialize(record);
        this.assertUsable();
        if (record.state !== "ready")
            throw initializationFailure(record.engine, new Error("Engine is not ready."));
        const execute = async () => {
            if (this.disposed || record.state === "disposed") {
                throw new SdkException(sdkError("session_disposed", `Decoder engine '${id}' has been disposed.`, { engineId: id }));
            }
            return record.engine.decode(frame, options);
        };
        const track = (operation) => {
            record.active.add(operation);
            void operation.finally(() => record.active.delete(operation)).catch(() => undefined);
            return operation;
        };
        if (record.engine.capabilities.threadSafe)
            return track(execute());
        const previous = record.tail;
        let release;
        record.tail = new Promise((resolve) => { release = resolve; });
        await previous;
        try {
            return await track(execute());
        }
        finally {
            release();
        }
    }
    async disposeAll() {
        if (this.disposed) {
            await Promise.all([...this.records.values()].map((record) => record.disposePromise));
            return;
        }
        this.disposed = true;
        await Promise.all([...this.records.values()].map(async (record) => {
            if (record.disposePromise)
                return record.disposePromise;
            record.disposePromise = (async () => {
                await record.initializePromise?.catch(() => undefined);
                await record.tail;
                await Promise.allSettled([...record.active]);
                if (record.state !== "disposed")
                    await record.engine.dispose?.();
                record.state = "disposed";
            })();
            return record.disposePromise;
        }));
    }
    get isDisposed() { return this.disposed; }
    async initialize(record) {
        if (record.state === "ready")
            return;
        if (record.state === "disposed" || this.disposed)
            this.assertUsable();
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
                if (record.state === "failed" && record.initializePromise === promise)
                    record.initializePromise = undefined;
            });
            record.initializePromise = promise;
        }
        await record.initializePromise;
    }
    assertUsable() {
        if (this.disposed)
            throw new SdkException(sdkError("session_disposed", "Decoder engine registry has been disposed."));
    }
}
//# sourceMappingURL=engine-registry.js.map