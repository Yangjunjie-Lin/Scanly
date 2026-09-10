export function abortError(): Error { return new DOMException("URL analysis cancelled", "AbortError"); }
export function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }
/** Bounds even a misbehaving custom provider that ignores AbortSignal. */
export async function withBudget<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  throwIfAborted(parent);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: (reason: Error) => void = () => {};
  const stop = () => { controller.abort(); rejectAbort(abortError()); };
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  parent?.addEventListener("abort", stop, { once: true });
  timer = setTimeout(stop, ms);
  try { return await Promise.race([Promise.resolve().then(() => { throwIfAborted(controller.signal); return work(controller.signal); }), aborted]); }
  finally { clearTimeout(timer); parent?.removeEventListener("abort", stop); controller.abort(); }
}
export function boundedNumber(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0 || value > maximum) throw new Error("url_safety_invalid_budget");
  return value;
}
