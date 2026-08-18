# Browser and device validation matrix

Browser benchmark JSON is runtime-specific and is never compared directly with Node timing baselines. Each artifact records browser version, OS/user agent, architecture/platform, Worker, OffscreenCanvas and ImageBitmap availability, recall, false positives, average latency, P95 latency, and whether a browser heap observation exists.

No certified real-device result currently exists. The harness accepts `DeviceBenchmarkMetadata`, but no values are fabricated.

| Target | Status |
| --- | --- |
| Windows Chromium | local/CI browser harness; real camera device untested |
| Windows Firefox | local/CI browser harness; real camera device untested |
| macOS Safari | untested |
| Android Chrome | untested |
| Android WebView | untested |
| iPhone Safari | untested |
| iPad Safari | untested |
| Low-end Android | untested |
| Mid-range Android | untested |
| Modern flagship phone | untested |

Thermal state, power mode, autofocus behavior, permission revocation, and sustained camera FPS require physical-device runs.
