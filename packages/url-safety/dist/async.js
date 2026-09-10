export function abortError() { return new DOMException("URL analysis cancelled", "AbortError"); }
export function throwIfAborted(signal) { if (signal?.aborted)
    throw abortError(); }
/** Bounds even a misbehaving custom provider that ignores AbortSignal. */
export async function withBudget(work, ms, parent) {
    throwIfAborted(parent);
    const controller = new AbortController();
    let timer;
    let rejectAbort = () => { };
    const stop = () => { controller.abort(); rejectAbort(abortError()); };
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    parent?.addEventListener("abort", stop, { once: true });
    timer = setTimeout(stop, ms);
    try {
        return await Promise.race([Promise.resolve().then(() => { throwIfAborted(controller.signal); return work(controller.signal); }), aborted]);
    }
    finally {
        clearTimeout(timer);
        parent?.removeEventListener("abort", stop);
        controller.abort();
    }
}
export function boundedNumber(value, fallback, maximum) {
    if (value === undefined)
        return fallback;
    if (!Number.isFinite(value) || value <= 0 || value > maximum)
        throw new Error("url_safety_invalid_budget");
    return value;
}
//# sourceMappingURL=async.js.map