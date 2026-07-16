# Camera Worker architecture

The default browser camera path samples at most one RGBA frame at a time, caps the longest side at 960 pixels, and transfers the backing `ArrayBuffer` to a persistent module Worker. The Worker owns one CaptureRouter and engine registry for its lifetime. Upload and camera jobs converge on the same Router result contract.

Generation IDs suppress results after source switch or stop. No frame queue exists: a sample is skipped while one frame is active. Stop cancels the active job and terminates the Worker; disposal also releases Router engines. A Worker construction or crash failure moves camera scanning to the main-thread CaptureSession for two frames, then permits a bounded Worker recovery attempt. Browsers without Worker support use the main-thread path.

Camera scanning starts with `fast`, tries an expanded previous-result ROI when upright geometry exists, and enters `balanced` for bounded attempts after a configured miss threshold. Result, stop, and source switch clear internal track/ROI state. `InternalTrack` is not a public tracked-instance feature.

Torch, zoom, facing mode, preferred resolution, page visibility, track-ended, device switch, and orientation-change hooks are capability-aware. OffscreenCanvas, ImageBitmap, and VideoFrame are detected by the browser benchmark but are not mandatory transfer formats in Alpha.3.
