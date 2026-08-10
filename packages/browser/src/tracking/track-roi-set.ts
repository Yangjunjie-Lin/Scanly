import type { BarcodeTrack, TrackROI, TrackROIFrame, TrackROIPlan, TrackROISetOptions } from "./types.js";
import { translateGeometry } from "./geometry.js";

const DEFAULT_MAX_ROIS = 32;

/**
 * Produces a bounded, renderer/decoder-neutral multi-target ROI plan. The plan
 * always schedules a periodic global scan so ROI optimization cannot hide a
 * newly entering barcode indefinitely.
 */
export class TrackROISet {
  private readonly options: Required<TrackROISetOptions>;
  private lastGlobalFrame: number | undefined;
  private lastSize = 0;

  constructor(options: TrackROISetOptions = {}) {
    this.options = {
      maxROIs: positiveInteger(options.maxROIs, DEFAULT_MAX_ROIS),
      expansion: bounded(options.expansion, 0.25, 0, 2),
      missedFrameExpansion: bounded(options.missedFrameExpansion, 0.15, 0, 1),
      globalScanIntervalFrames: positiveInteger(options.globalScanIntervalFrames, 10),
      uncoveredGridSize: positiveInteger(options.uncoveredGridSize, 4),
      maxUncoveredRegions: positiveInteger(options.maxUncoveredRegions, 16),
    };
  }

  plan(tracks: readonly BarcodeTrack[], frame: TrackROIFrame): TrackROIPlan {
    validateFrame(frame);
    const eligible = tracks
      .filter((track) => track.state === "confirmed" || track.state === "lost")
      .sort((a, b) => statePriority(a.state) - statePriority(b.state) || a.trackId.localeCompare(b.trackId))
      .slice(0, this.options.maxROIs);
    const trackedROIs = eligible.map((track) => this.roiFor(track, frame));
    const uncoveredRegions = createUncoveredGrid(
      trackedROIs,
      this.options.uncoveredGridSize,
      this.options.maxUncoveredRegions,
    );
    const includeFullFrame = trackedROIs.length === 0
      || this.lastGlobalFrame === undefined
      || frame.frameId - this.lastGlobalFrame >= this.options.globalScanIntervalFrames;
    if (includeFullFrame) this.lastGlobalFrame = frame.frameId;
    this.lastSize = trackedROIs.length;
    const phases: Array<"tracked-rois" | "uncovered-regions" | "full-frame"> = [];
    if (trackedROIs.length > 0) phases.push("tracked-rois");
    if (uncoveredRegions.length > 0) phases.push("uncovered-regions");
    if (includeFullFrame) phases.push("full-frame");
    return { frameId: frame.frameId, trackedROIs, uncoveredRegions, includeFullFrame, phases };
  }

  get size(): number { return this.lastSize; }

  reset(): void {
    this.lastGlobalFrame = undefined;
    this.lastSize = 0;
  }

  private roiFor(track: BarcodeTrack, frame: TrackROIFrame): TrackROI {
    const deltaFrames = Math.max(0, frame.frameId - track.lastFrameId);
    const predicted = Boolean(track.velocity && deltaFrames > 0);
    const geometry = predicted && track.velocity
      ? translateGeometry(track.geometry, track.velocity.x * deltaFrames, track.velocity.y * deltaFrames)
      : track.geometry;
    const expansion = this.options.expansion + track.missedFrameCount * this.options.missedFrameExpansion;
    const dx = geometry.boundingBox.width * expansion;
    const dy = geometry.boundingBox.height * expansion;
    const left = clamp(geometry.boundingBox.x - dx, 0, frame.width);
    const top = clamp(geometry.boundingBox.y - dy, 0, frame.height);
    const right = clamp(geometry.boundingBox.x + geometry.boundingBox.width + dx, left, frame.width);
    const bottom = clamp(geometry.boundingBox.y + geometry.boundingBox.height + dy, top, frame.height);
    return {
      trackId: track.trackId,
      state: track.state,
      x: left / frame.width,
      y: top / frame.height,
      width: (right - left) / frame.width,
      height: (bottom - top) / frame.height,
      predicted,
      missCount: track.missedFrameCount,
    };
  }
}

function createUncoveredGrid(
  tracked: readonly TrackROI[],
  gridSize: number,
  maximum: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (tracked.length === 0) return [];
  const cellSize = 1 / gridSize;
  const uncovered: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let row = 0; row < gridSize && uncovered.length < maximum; row += 1) {
    for (let column = 0; column < gridSize && uncovered.length < maximum; column += 1) {
      const cell = { x: column * cellSize, y: row * cellSize, width: cellSize, height: cellSize };
      if (!tracked.some((roi) => rectanglesIntersect(cell, roi))) uncovered.push(cell);
    }
  }
  return uncovered;
}

function rectanglesIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function statePriority(state: BarcodeTrack["state"]): number { return state === "confirmed" ? 0 : 1; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function positiveInteger(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(1, Math.floor(value));
}
function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : clamp(value, minimum, maximum);
}
function validateFrame(frame: TrackROIFrame): void {
  if (!Number.isInteger(frame.frameId) || frame.frameId < 0 || !Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width <= 0 || frame.height <= 0) {
    throw new RangeError("TrackROISet requires a non-negative frameId and positive finite frame dimensions.");
  }
}
