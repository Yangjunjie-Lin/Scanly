export declare function abortError(): Error;
export declare function throwIfAborted(signal?: AbortSignal): void;
/** Bounds even a misbehaving custom provider that ignores AbortSignal. */
export declare function withBudget<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T>;
export declare function boundedNumber(value: number | undefined, fallback: number, maximum: number): number;
//# sourceMappingURL=async.d.ts.map