# Benchmark

This document is generated only by the approved canonical evidence update command. Latency is environment-specific and is not a commercial parity claim.

## Canonical source

| Field | Value |
| --- | --- |
| Evidence ID | `alpha4-cc1a5968d39ffbea` |
| Manifest hash | `ae9d988f36b9788031ec756ca31daa5d21317e65954bc91eadbc8d995b9d087e` |
| Source commit | `a139c8b7064a83c26cfba5a9ff4fb75c3f6c9f83` |
| Source tree | `31da835767e4d691716f3c327f4cbb0b615d95ac` |
| Dataset hash | `47d72bf1658ab7a0bde1a402b6f6c382c21f7822d5715a714436191acf62f79b` |
| Package-lock hash | `b58a10200d6cff43739296ed746f588b8af49ebafe6c5dd2c9dd64ce9356372a` |
| Engine composition hash | `bad73615e3d603234766c2230c3f15007cd2e5e6a2bd87d95ff2dff07633111d` |
| WASM build hash | `6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f` |
| Native adapter hash | `0b385edcaa5757dde122bd4f393d7a6bdefa5acb0f8cacbd2cb7c21f1e3affcd` |
| Loader hash | `44ea432ec4666d708e3758807ae51ba542b04704fda362529b812561c73b2224` |
| Repository dirty | false |
| Warmup iterations | 1 |
| Measured iterations | 3 |

## Balanced correctness and latency

| Metric | Value |
| --- | ---: |
| Fixtures | 73/74 |
| Positive recall | 62/63 |
| False positives | 0/11 |
| Average | 674.66 ms |
| Median | 569.50 ms |
| P95 | 1787.00 ms |
| Peak controlled memory | 66727104 bytes |
| Final controlled memory | 0 bytes |
| Remaining failure | `14-damaged` |
| Parallel execution | experimental |

See the canonical JSON aliases for per-fixture iteration timings, phase timing, variance, attempts, and profile-specific metrics.
# Alpha.5 measurement boundary

Alpha.5 reports must retain the legacy QR suite as a separate denominator and add per-format recall, exact accuracy, false positives, format confusion, checksum rejection, GS1 recognition, and mixed-format completeness. The `benchmark:symbologies` command currently emits a contract-only engine matrix; it intentionally does not manufacture accuracy numbers before the dedicated Alpha.5 fixture corpus is frozen and measured from a clean source commit.
