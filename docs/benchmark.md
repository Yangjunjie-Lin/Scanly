# Benchmark

This document is generated only by the approved canonical evidence update command. Latency is environment-specific and is not a commercial parity claim.

## Canonical source

| Field | Value |
| --- | --- |
| Evidence ID | `alpha4-a5d247a9376e449f` |
| Manifest hash | `59046bfb0c1314f3ab7f3a83080d268b961510867648a16f8f499ede18fa8fe8` |
| Source commit | `176f91f8d53b3aecd1c102b1e75498f87b4bd7cb` |
| Source tree | `e6ba0cff22785fa873815f953f2e56a19754d535` |
| Dataset hash | `47d72bf1658ab7a0bde1a402b6f6c382c21f7822d5715a714436191acf62f79b` |
| Package-lock hash | `77972addd78e43e4dfc29c9aef7018a11ca209a6fa3551dd6a5b99282db56702` |
| Engine composition hash | `04b14040d852e9e12c74b14a0e15ee323daf7e6f4d6abe416c758b6df7a2d22e` |
| WASM build hash | `6a858c01e076bab3a1bd413e4f2cf5e5e45f819a0d9441d83c66993bc48ed38f` |
| Native adapter hash | `ac3f458a5d1b512fbfbbdd0789fb498c1e5318c3cc0abb8b981f56eaecce0847` |
| Loader hash | `af7aa9d3404f6bbe450dec9977fb0bc9b3b2981bcf7d683779b245470c26fd29` |
| Repository dirty | false |
| Warmup iterations | 1 |
| Measured iterations | 3 |

## Balanced correctness and latency

| Metric | Value |
| --- | ---: |
| Fixtures | 73/74 |
| Positive recall | 62/63 |
| False positives | 0/11 |
| Average | 449.38 ms |
| Median | 377.00 ms |
| P95 | 1133.00 ms |
| Peak controlled memory | 66727104 bytes |
| Final controlled memory | 0 bytes |
| Remaining failure | `14-damaged` |
| Parallel execution | experimental |

See the canonical JSON aliases for per-fixture iteration timings, phase timing, variance, attempts, and profile-specific metrics.
