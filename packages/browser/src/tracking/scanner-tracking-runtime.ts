import type { NormalizedFrame } from "@scanly/core";
import type { BarcodeObservationSet } from "../scanner/types.js";
import type { DecodeProfile, ScannerDecodeROIPhase, TemporalROIHint } from "../scanner/types.js";
import { BarcodeTracker } from "./barcode-tracker.js";
import { TrackROISet } from "./track-roi-set.js";
import type {
  BarcodeTrack,
  BarcodeTrackerOptions,
  TrackROI,
  TrackROIPlan,
  TrackROISetOptions,
  TrackingStatistics,
} from "./types.js";

const DEFAULT_MAX_RESULTS = 32;
const DEFAULT_UNCOVERED_INTERVAL = 2;

export interface ScannerTrackingRuntimeOptions {
  tracker?: BarcodeTracker;
  trackerOptions?: BarcodeTrackerOptions;
  roiSet?: TrackROISet;
  roi?: TrackROISetOptions;
  /** Maximum observations retained from one bounded multi-code decode. */
  maxResults?: number;
  /** Optional profile pin; omitted to retain Beta 1 bounded escalation. */
  profile?: DecodeProfile;
  /** Non-global frames between one tracked-envelope request and an uncovered-cell request. */
  uncoveredRegionIntervalFrames?: number;
}

export interface ScannerTrackingDecodeSelection {
  phase: Exclude<ScannerDecodeROIPhase, "temporal">;
  roi?: TemporalROIHint;
  plan: TrackROIPlan;
}

/**
 * Small composition layer between ScannerSession and BarcodeTracker. It turns
 * a TrackROISet plan into one decode request per frame, keeping decode work
 * independent of the number of live tracks.
 */
export class ScannerTrackingRuntime {
  readonly maxResults: number;
  readonly profile?: DecodeProfile;
  private readonly tracker: BarcodeTracker;
  private readonly roiSet: TrackROISet;
  private readonly uncoveredRegionIntervalFrames: number;
  private nonGlobalFrameCount = 0;
  private uncoveredCursor = 0;

  constructor(options: ScannerTrackingRuntimeOptions = {}) {
    this.tracker = options.tracker ?? new BarcodeTracker(options.trackerOptions);
    this.roiSet = options.roiSet ?? new TrackROISet(options.roi);
    this.maxResults = positiveInteger(
      options.maxResults
        ?? options.trackerOptions?.maxObservations
        ?? options.trackerOptions?.maxTracks
        ?? options.trackerOptions?.maxTrackedBarcodes,
      DEFAULT_MAX_RESULTS,
      DEFAULT_MAX_RESULTS,
    );
    this.profile = options.profile;
    this.uncoveredRegionIntervalFrames = positiveInteger(
      options.uncoveredRegionIntervalFrames,
      DEFAULT_UNCOVERED_INTERVAL,
      Number.MAX_SAFE_INTEGER,
    );
  }

  selectDecode(frameId: number, frame: Pick<NormalizedFrame, "width" | "height">): ScannerTrackingDecodeSelection {
    const plan = this.roiSet.plan(this.tracker.getTracks(), { frameId, width: frame.width, height: frame.height });
    if (plan.includeFullFrame) {
      this.nonGlobalFrameCount = 0;
      return { phase: "full-frame", plan };
    }

    this.nonGlobalFrameCount += 1;
    const selectUncovered = plan.uncoveredRegions.length > 0
      && this.nonGlobalFrameCount % this.uncoveredRegionIntervalFrames === 0;
    if (selectUncovered) {
      const region = plan.uncoveredRegions[this.uncoveredCursor % plan.uncoveredRegions.length];
      this.uncoveredCursor += 1;
      // One rectangular decode covers both the current tracks and one search
      // cell. Existing tracks therefore remain observable while discovery is
      // interleaved without adding a second decode call.
      const combined = region ? roiEnvelope([...plan.trackedROIs, region]) : undefined;
      if (combined) {
        const maximumMisses = plan.trackedROIs.reduce((maximum, roi) => Math.max(maximum, roi.missCount), 0);
        return { phase: "uncovered-regions", roi: hint(combined, maximumMisses), plan };
      }
    }

    const envelope = roiEnvelope(plan.trackedROIs);
    if (envelope) {
      const maximumMisses = plan.trackedROIs.reduce((maximum, roi) => Math.max(maximum, roi.missCount), 0);
      return { phase: "tracked-rois", roi: hint(envelope, maximumMisses), plan };
    }

    // Defensive fallback: an empty/invalid plan may never suppress recovery.
    return { phase: "full-frame", plan };
  }

  observe(set: BarcodeObservationSet): void {
    this.tracker.observeFrame(set.observations.flatMap((observation) => observation.geometry ? [{
      payload: observation.barcode.text,
      format: observation.barcode.format,
      geometry: observation.geometry,
    }] : []), { frameId: set.frameId, timestamp: set.timestamp });
  }

  getTracks(): readonly BarcodeTrack[] { return this.tracker.getTracks(); }
  getStatistics(): TrackingStatistics { return this.tracker.getStatistics(); }
  get controlledSize(): number { return this.tracker.size + this.roiSet.size; }

  reset(): void {
    this.tracker.reset();
    this.roiSet.reset();
    this.nonGlobalFrameCount = 0;
    this.uncoveredCursor = 0;
  }
}

function roiEnvelope(rois: readonly Pick<TrackROI, "x" | "y" | "width" | "height">[]): { x: number; y: number; width: number; height: number } | undefined {
  if (rois.length === 0) return undefined;
  const left = Math.min(...rois.map((roi) => roi.x));
  const top = Math.min(...rois.map((roi) => roi.y));
  const right = Math.max(...rois.map((roi) => roi.x + roi.width));
  const bottom = Math.max(...rois.map((roi) => roi.y + roi.height));
  if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function hint(
  region: { x: number; y: number; width: number; height: number },
  missCount: number,
): TemporalROIHint {
  return { ...region, ageMs: 0, missCount };
}

function positiveInteger(value: number | undefined, fallback: number, maximum: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(1, Math.min(maximum, Math.floor(value)));
}
