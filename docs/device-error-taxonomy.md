# Camera and device error taxonomy

| Code | Meaning | Retry policy |
| --- | --- | --- |
| `camera_permission_denied` | User or platform denied camera access | not automatically retried |
| `camera_not_found` | No matching camera exists | not automatically retried |
| `camera_busy` | Hardware cannot start or is in use | bounded recovery may retry |
| `camera_constraint_failed` | Requested constraints could not be negotiated | bounded fallback/recovery |
| `camera_track_ended` | Active MediaStreamTrack ended | bounded recovery |
| `camera_capability_unsupported` | Torch, zoom, or focus control is unavailable | explicit unsupported result; scanner continues |
| `camera_recovery_failed` | Recovery budget exhausted or source cannot restart | explicit failed session |
| `browser_background_suspended` | Browser suspended capture/runtime in background | resume/recover or explicit failure |

Legacy `camera_unavailable`, `source_disconnected`, and `unsupported_browser_capability` remain accepted for compatibility, but Beta 4 camera platform code emits the more specific codes above. Errors are `SdkError` values; camera startup rejects with `SdkException` carrying the typed error.
