# Beta 2 barcode tracking and batch scan

Beta 2 composes multi-target identity and batch state on top of the Beta 1 camera runtime. It does not create a second capture or decode pipeline:

```text
CameraFrameSource
  -> ScannerSession / one bounded multi-code decode
  -> BarcodeObservationSet (all valid results for the frame)
  -> BarcodeTracker
  -> BarcodeTrack lifecycle
  -> BatchController
  -> BatchState, TrackEvent, and BatchEvent
```

`ScannerSession` continues to own capture, frame admission, latest-frame backpressure, quality probes, bounded Fast/Balanced/Robust escalation, the persistent Worker, WASM, cancellation, and frame release. `BatchScanSession` is the SDK-owned composition of an existing `ScannerSession`, a `BarcodeTracker`, and a `BatchController`. A UI subscribes to snapshots and events; it does not associate observations, create physical identities, or decide completion.

## Physical identity and association

`BarcodeTrack.trackId` and `physicalInstanceId` identify a physical observation path. Neither is derived from payload equality. Equal UPC values at different geometries therefore remain separate tracks and can independently satisfy a quantity-based batch.

For every complete frame observation set, `BarcodeTracker` builds a bounded cost matrix from:

- payload and format compatibility;
- center distance and geometry-size change;
- intersection-over-union penalty;
- constant-velocity prediction and direction consistency;
- elapsed frames/time since the prior observation.

The tracker applies deterministic Hungarian minimum-cost assignment with dummy unmatched columns and an association threshold. `maxTracks`, `maxTrackedBarcodes`, `maxObservations`, and `associationThreshold` bound work and state; the default live-track and per-frame observation limits are 32. Real observed geometry outweighs the soft motion prediction.

The lifecycle is `tentative -> confirmed -> lost -> retired`. A short miss enters `lost`; a compatible observation inside `maxMissedFrames` restores the same track. A longer disappearance retires the identity. Re-entry after retirement creates a new identity and is reported as an explicit fragment by Ground Truth evaluation rather than silently joined.

## Batch composition

```ts
import {
  BatchScanSession,
  MediaStreamCameraFrameSource,
  ScannerSession,
  createTrackOverlayModels,
} from "@scanly/browser";

const scanner = new ScannerSession({
  source: new MediaStreamCameraFrameSource({ video }),
  repeatPolicy: { mode: "physical-instance" },
});

const batch = new BatchScanSession({
  scanner,
  mode: "expected-count",
  expectedCount: 12,
  trackerOptions: { maxTrackedBarcodes: 32 },
});

batch.onTrack(() => {
  renderOverlays(createTrackOverlayModels(batch.getTracks()));
});
batch.onBatchEvent((event) => {
  renderProgress(batch.getBatchState());
  if (event.type === "batch-completed") announceCompletion(event.state);
});

await batch.start();
```

The public batch modes are:

| Mode | Completion and classification |
| --- | --- |
| `continuous` | Never auto-completes; publishes ongoing track state. |
| `expected-count` | Completes at the configured number of confirmed physical instances. |
| `checklist` | Matches expected payload/optional format quantities and reports missing, unexpected, and duplicate tracks. |
| `unique-physical-instance` | Counts confirmed physical identities when an expected count is supplied by an advanced controller composition. |

Checklist quantities are physical counts. For example, `{ payload: "012345678905", format: "upc_a", quantity: 10 }` requires ten confirmed physical tracks; it is not reduced to a `Set(payload)`.

`BatchStatus` is `collecting`, `complete`, `failed`, or `cancelled`. A raw decoder result, repeated event, or tentative track cannot complete a batch. `pause`, `resume`, `stop`, and `dispose` delegate to the composed scanner lifecycle and invalidate pending observation work.

## Multi-target ROI and overlay boundaries

`TrackROISet` produces a bounded plan of predicted per-track ROIs, uncovered regions, and periodic full-frame recovery. The full-frame phase prevents a set of established ROIs from permanently hiding a newly entering barcode. It is a scheduling model, not a request for one Robust decode per track.

`TrackOverlayModel` is renderer-neutral data containing `trackId`, `physicalInstanceId`, payload, format, state, bounding box, corner points, and optional velocity. The web demo converts these models to DOM rectangles. Canvas, SVG, DOM layout, color, and labels remain application concerns.

## Evidence and limits

The development tracking benchmark runs independently defined Ground Truth paths through basic, multi-object, identity, lifecycle, batch, and stress scenarios. Evaluation matches predicted identities to Ground Truth objects per frame and derives identity switches, fragmentation, false tracks, matched/missed observations, recall, and precision. Track-count equality alone is not a pass condition.

Scale reports record 1, 4, 8, and 16 target association/tracking latency, effective FPS, decoder calls per frame, and maximum association pairs. The 10,000-frame core soak uses 16 moving tracks and requires bounded track, lost, ROI, pending-observation, and controlled-memory state. The separate Worker/WASM soak preserves multi-result observation sets through one persistent Worker for at least 1,000 PR frames and verifies final native/allocation cleanup.

These are deterministic development and integration measurements. They do not claim industrial tracking, warehouse certification, physical-device coverage, or parity with a commercial MatrixScan product. Physical camera/device work remains tracked separately.
