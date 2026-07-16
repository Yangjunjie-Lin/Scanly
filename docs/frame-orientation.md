# Frame orientation and coordinates

`NormalizedFrame.data` is stored in source-buffer order. `orientation` is the clockwise rotation required to display those source pixels upright. The first CaptureRouter operator converts RGBA/RGB/gray input to tightly packed RGBA and rotates it to canonical upright pixels.

- `90` and `270` swap width and height.
- ROI values are evaluated after orientation normalization.
- Candidate crop, scale, and attempt-rotation transforms map decoder points back to the upright frame.
- Public `cornerPoints` are upright-frame pixel coordinates.
- Public symbol `orientation` is engine-derived relative to that upright frame.
- `sourceToUpright` and its inverse are retained internally; raw-source corners are not a second Alpha.3 public coordinate space.
- Canvas camera readback is already visually upright and therefore uses `frame.orientation: 0`, the pixel-buffer orientation. `frame.device.displayOrientation` separately records screen/device orientation metadata and never requests a second pixel rotation.

Unit and real-router tests cover 0/90/180/270, non-square dimension swaps, inverse mapping, real rotated QR buffers, and Worker metadata transfer.
