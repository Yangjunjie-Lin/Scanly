import type {
  GroundTruthTrack,
  PredictedTrackSnapshot,
  TrackingEvaluationResult,
  TrackingFrameEvaluation,
  TrackingFrameMatch,
  TrackingGeometrySpec,
} from "./types.js";

export interface TrackingEvaluatorOptions {
  maximumMatchCost?: number;
}

interface CandidatePair {
  objectId: string;
  trackId: string;
  cost: number;
}

function center(geometry: TrackingGeometrySpec): { x: number; y: number } {
  const box = geometry.boundingBox;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function intersectionOverUnion(a: TrackingGeometrySpec, b: TrackingGeometrySpec): number {
  const left = Math.max(a.boundingBox.x, b.boundingBox.x);
  const top = Math.max(a.boundingBox.y, b.boundingBox.y);
  const right = Math.min(a.boundingBox.x + a.boundingBox.width, b.boundingBox.x + b.boundingBox.width);
  const bottom = Math.min(a.boundingBox.y + a.boundingBox.height, b.boundingBox.y + b.boundingBox.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.boundingBox.width * a.boundingBox.height + b.boundingBox.width * b.boundingBox.height - intersection;
  return union > 0 ? intersection / union : 0;
}

/** Evaluator cost is deliberately independent from BarcodeTracker's association cost. */
export function trackingEvaluationCost(a: TrackingGeometrySpec, b: TrackingGeometrySpec): number {
  const ac = center(a);
  const bc = center(b);
  const frameWidth = Math.max(1, a.frameWidth, b.frameWidth);
  const frameHeight = Math.max(1, a.frameHeight, b.frameHeight);
  const diagonal = Math.hypot(frameWidth, frameHeight);
  const centerDistance = Math.hypot(ac.x - bc.x, ac.y - bc.y) / diagonal;
  const areaA = Math.max(1, a.boundingBox.width * a.boundingBox.height);
  const areaB = Math.max(1, b.boundingBox.width * b.boundingBox.height);
  const sizePenalty = Math.abs(Math.log(areaA / areaB));
  return centerDistance * 2 + (1 - intersectionOverUnion(a, b)) * 0.65 + sizePenalty * 0.15;
}

export class TrackingEvaluator {
  private readonly groundTruth: readonly GroundTruthTrack[];
  private readonly maximumMatchCost: number;
  private readonly frames: TrackingFrameEvaluation[] = [];
  private readonly priorTrackByObject = new Map<string, string>();
  private readonly priorMatchedFrameByObject = new Map<string, number>();
  private readonly trackIdsByObject = new Map<string, Set<string>>();
  private readonly matchedConfirmedTrackIds = new Set<string>();
  private readonly confirmedTrackIds = new Set<string>();
  private readonly confirmedTrackLifetimes = new Map<string, { first: number; last: number }>();
  private identitySwitchCount = 0;
  private matchedObservationCount = 0;
  private missedObservationCount = 0;
  private falseTrackObservationCount = 0;
  private falseConfirmedTrackObservationCount = 0;
  private unmatchedTentativeTrackObservationCount = 0;

  constructor(groundTruth: readonly GroundTruthTrack[], options: TrackingEvaluatorOptions = {}) {
    this.groundTruth = groundTruth;
    this.maximumMatchCost = options.maximumMatchCost ?? 1.15;
  }

  evaluateFrame(frameIndex: number, tracks: readonly PredictedTrackSnapshot[]): TrackingFrameEvaluation {
    const truths = this.groundTruth.flatMap((track) => {
      const frame = track.frames.find((entry) => entry.frameIndex === frameIndex);
      return frame?.visible && frame.geometry ? [{ track, geometry: frame.geometry }] : [];
    });
    const visibleTracks = tracks.filter((track) =>
      track.lastFrameId === frameIndex && (track.state === "tentative" || track.state === "confirmed"),
    );
    const visibleTrackById = new Map(visibleTracks.map((track) => [track.trackId, track]));

    for (const track of tracks) {
      if (track.state !== "confirmed") continue;
      this.confirmedTrackIds.add(track.trackId);
      const lifetime = this.confirmedTrackLifetimes.get(track.trackId);
      if (lifetime) lifetime.last = Math.max(lifetime.last, track.lastFrameId);
      else this.confirmedTrackLifetimes.set(track.trackId, { first: track.firstFrameId, last: track.lastFrameId });
    }

    const pairs: CandidatePair[] = [];
    for (const truth of truths) {
      for (const predicted of visibleTracks) {
        if (truth.track.payload !== predicted.payload || truth.track.format !== predicted.format) continue;
        const cost = trackingEvaluationCost(truth.geometry, predicted.geometry);
        if (cost <= this.maximumMatchCost) pairs.push({ objectId: truth.track.objectId, trackId: predicted.trackId, cost });
      }
    }
    pairs.sort((a, b) => a.cost - b.cost || a.objectId.localeCompare(b.objectId) || a.trackId.localeCompare(b.trackId));

    const usedObjects = new Set<string>();
    const usedTracks = new Set<string>();
    const matches: TrackingFrameMatch[] = [];
    let frameIdentitySwitches = 0;
    for (const pair of pairs) {
      if (usedObjects.has(pair.objectId) || usedTracks.has(pair.trackId)) continue;
      usedObjects.add(pair.objectId);
      usedTracks.add(pair.trackId);
      matches.push(pair);
      if (visibleTrackById.get(pair.trackId)?.state === "confirmed") {
        this.matchedConfirmedTrackIds.add(pair.trackId);
      }
      const history = this.trackIdsByObject.get(pair.objectId) ?? new Set<string>();
      history.add(pair.trackId);
      this.trackIdsByObject.set(pair.objectId, history);
      const prior = this.priorTrackByObject.get(pair.objectId);
      const priorFrame = this.priorMatchedFrameByObject.get(pair.objectId);
      // A replacement after a visibility gap is fragmentation; an identity
      // change across adjacent visible frames is an identity switch.
      if (prior !== undefined && prior !== pair.trackId && priorFrame === frameIndex - 1) {
        frameIdentitySwitches += 1;
        this.identitySwitchCount += 1;
      }
      this.priorTrackByObject.set(pair.objectId, pair.trackId);
      this.priorMatchedFrameByObject.set(pair.objectId, frameIndex);
    }

    const missedObjectIds = truths.map(({ track }) => track.objectId).filter((id) => !usedObjects.has(id));
    const unmatchedTracks = visibleTracks.filter((track) => !usedTracks.has(track.trackId));
    const unmatchedTrackIds = unmatchedTracks.map((track) => track.trackId);
    const unmatchedConfirmedTrackIds = unmatchedTracks.filter((track) => track.state === "confirmed").map((track) => track.trackId);
    const unmatchedTentativeTrackIds = unmatchedTracks.filter((track) => track.state === "tentative").map((track) => track.trackId);
    this.matchedObservationCount += matches.length;
    this.missedObservationCount += missedObjectIds.length;
    this.falseTrackObservationCount += unmatchedTrackIds.length;
    this.falseConfirmedTrackObservationCount += unmatchedConfirmedTrackIds.length;
    this.unmatchedTentativeTrackObservationCount += unmatchedTentativeTrackIds.length;

    const evaluation: TrackingFrameEvaluation = {
      frameIndex,
      visibleGroundTruthCount: truths.length,
      predictedVisibleTrackCount: visibleTracks.length,
      matches,
      missedObjectIds,
      unmatchedTrackIds,
      unmatchedConfirmedTrackIds,
      unmatchedTentativeTrackIds,
      identitySwitches: frameIdentitySwitches,
    };
    this.frames.push(evaluation);
    return evaluation;
  }

  finish(): TrackingEvaluationResult {
    // A track is only exonerated by a Ground Truth match on a frame where it
    // was confirmed. A tentative match cannot mask a later false confirmation.
    const falseTrackIds = [...this.confirmedTrackIds]
      .filter((trackId) => !this.matchedConfirmedTrackIds.has(trackId))
      .sort();
    const fragmentation = [...this.trackIdsByObject.values()].reduce((sum, ids) => sum + Math.max(0, ids.size - 1), 0);
    const recallDenominator = this.matchedObservationCount + this.missedObservationCount;
    const precisionDenominator = this.matchedObservationCount + this.falseTrackObservationCount;
    const lifetimes = [...this.confirmedTrackLifetimes.values()].map(({ first, last }) => Math.max(1, last - first + 1));
    const objectTrackHistory = Object.fromEntries(
      this.groundTruth.map((track) => [track.objectId, [...(this.trackIdsByObject.get(track.objectId) ?? [])]]),
    );
    return {
      metrics: {
        groundTruthObjectCount: this.groundTruth.length,
        confirmedTrackCount: this.confirmedTrackIds.size,
        identitySwitchCount: this.identitySwitchCount,
        trackFragmentationCount: fragmentation,
        falseTrackCount: falseTrackIds.length,
        matchedObservationCount: this.matchedObservationCount,
        missedObservationCount: this.missedObservationCount,
        falseTrackObservationCount: this.falseTrackObservationCount,
        falseConfirmedTrackObservationCount: this.falseConfirmedTrackObservationCount,
        unmatchedTentativeTrackObservationCount: this.unmatchedTentativeTrackObservationCount,
        trackRecall: recallDenominator === 0 ? 1 : this.matchedObservationCount / recallDenominator,
        trackPrecision: precisionDenominator === 0 ? 1 : this.matchedObservationCount / precisionDenominator,
        averageTrackLifetimeFrames: lifetimes.length === 0 ? 0 : lifetimes.reduce((sum, value) => sum + value, 0) / lifetimes.length,
      },
      frameEvaluations: this.frames,
      objectTrackHistory,
      falseTrackIds,
    };
  }
}
