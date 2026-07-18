# Benchmark

This document is generated only by the approved canonical evidence update command. Latency is environment-specific and is not a commercial parity claim.

## Canonical source

| Field | Value |
| --- | --- |
| Evidence ID | `alpha4-ee263ee0858ec31a` |
| Manifest hash | `b04581e91a15bfa45524749104c14adbc44f170bd644a9e507e4d253a583bf92` |
| Source commit | `97a7399b86b702ff29184df6194c94e2bba3298c` |
| Source tree | `2d073f5643ece01e68330508ecf10d5c3fea234b` |
| Dataset hash | `47d72bf1658ab7a0bde1a402b6f6c382c21f7822d5715a714436191acf62f79b` |
| Package-lock hash | `b58a10200d6cff43739296ed746f588b8af49ebafe6c5dd2c9dd64ce9356372a` |
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
| Average | 521.73 ms |
| Median | 421.00 ms |
| P95 | 1434.00 ms |
| Peak controlled memory | 66727104 bytes |
| Final controlled memory | 0 bytes |
| Remaining failure | `14-damaged` |
| Parallel execution | experimental |

See the canonical JSON aliases for per-fixture iteration timings, phase timing, variance, attempts, and profile-specific metrics.
