import { BarcodeTracker } from "./barcode-tracker.js";
import { TrackROISet } from "./track-roi-set.js";
const DEFAULT_MAX_RESULTS = 32;
const DEFAULT_UNCOVERED_INTERVAL = 2;
/**
 * Small composition layer between ScannerSession and BarcodeTracker. It turns
 * a TrackROISet plan into one decode request per frame, keeping decode work
 * independent of the number of live tracks.
 */
export class ScannerTrackingRuntime {
    maxResults;
    profile;
    tracker;
    roiSet;
    uncoveredRegionIntervalFrames;
    nonGlobalFrameCount = 0;
    uncoveredCursor = 0;
    constructor(options = {}) {
        this.tracker = options.tracker ?? new BarcodeTracker(options.trackerOptions);
        this.roiSet = options.roiSet ?? new TrackROISet(options.roi);
        this.maxResults = positiveInteger(options.maxResults
            ?? options.trackerOptions?.maxObservations
            ?? options.trackerOptions?.maxTracks
            ?? options.trackerOptions?.maxTrackedBarcodes, DEFAULT_MAX_RESULTS, DEFAULT_MAX_RESULTS);
        this.profile = options.profile;
        this.uncoveredRegionIntervalFrames = positiveInteger(options.uncoveredRegionIntervalFrames, DEFAULT_UNCOVERED_INTERVAL, Number.MAX_SAFE_INTEGER);
    }
    selectDecode(frameId, frame) {
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
    observe(set) {
        this.tracker.observeFrame(set.observations.flatMap((observation) => observation.geometry ? [{
                payload: observation.barcode.text,
                format: observation.barcode.format,
                geometry: observation.geometry,
            }] : []), { frameId: set.frameId, timestamp: set.timestamp });
    }
    getTracks() { return this.tracker.getTracks(); }
    getStatistics() { return this.tracker.getStatistics(); }
    get controlledSize() { return this.tracker.size + this.roiSet.size; }
    reset() {
        this.tracker.reset();
        this.roiSet.reset();
        this.nonGlobalFrameCount = 0;
        this.uncoveredCursor = 0;
    }
}
function roiEnvelope(rois) {
    if (rois.length === 0)
        return undefined;
    const left = Math.min(...rois.map((roi) => roi.x));
    const top = Math.min(...rois.map((roi) => roi.y));
    const right = Math.max(...rois.map((roi) => roi.x + roi.width));
    const bottom = Math.max(...rois.map((roi) => roi.y + roi.height));
    if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top)
        return undefined;
    return { x: left, y: top, width: right - left, height: bottom - top };
}
function hint(region, missCount) {
    return { ...region, ageMs: 0, missCount };
}
function positiveInteger(value, fallback, maximum) {
    return value === undefined || !Number.isFinite(value)
        ? fallback
        : Math.max(1, Math.min(maximum, Math.floor(value)));
}
//# sourceMappingURL=scanner-tracking-runtime.js.map