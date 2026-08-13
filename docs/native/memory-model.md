# Native memory and thread model

The C ABI makes ownership and lifetime explicit:

| Value | Owner | Lifetime |
| --- | --- | --- |
| input pixels | caller | must remain readable only for the synchronous decode call |
| `scanly_context_t` | caller | create with `scanly_context_create`; destroy once with `scanly_context_destroy` |
| `scanly_result_set_t` | caller | destroy every non-null set with `scanly_result_set_destroy`, including diagnostic-only failure sets |
| result strings, bytes, geometry | result set | borrowed views; valid until that result set is destroyed |
| cancel token | caller | create/destroy explicitly; cancellation is atomic |
| Swift/Kotlin result values | platform wrapper | copied before the native result set is destroyed |

The core never retains input pixels. Swift locks a `CVPixelBuffer` only around
the synchronous decode. Android slices a direct `ByteBuffer`, validates its
declared layout, and closes the `ImageProxy` after analysis.

Swift callers may explicitly call `ScanlyDecoder.dispose()`; `deinit` is an
idempotent fallback. Kotlin callers use `ScanlyDecoder.close()`/`use`. A scanner
session takes ownership of the decoder passed to it and releases that decoder
when the session is disposed/closed; a decoder intended for independent use
must not be shared with an owned session.

A context is thread-safe through serialization: concurrent calls to the same
context wait on its decode mutex. Multiple contexts may decode concurrently.
Platform `ScanlyDecoder` instances add a matching lock, and sessions submit
frames serially.

Cancellation is cooperative. A token can prevent execution or suppress an
outcome after native execution, but it does not preempt a running ZXing-C++
call. Scanner generation invalidation guarantees that stale results are never
published after pause, stop, dispose, camera rebind, or replacement.

CI runs a 10,000 context/result lifecycle under AddressSanitizer, LeakSanitizer,
and UndefinedBehaviorSanitizer. Malformed dimensions, strides, lengths, masks,
and null pointers return typed statuses and must not crash.
