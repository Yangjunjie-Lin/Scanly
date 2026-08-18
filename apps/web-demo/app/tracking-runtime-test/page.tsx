"use client";

import { useEffect, useState } from "react";
import {
  BarcodeTracker,
  BatchController,
  type BarcodeObservation,
  type BarcodeTrack,
  type BarcodeTrackerOptions,
  type BatchControllerOptions,
  type BatchEvent,
} from "@scanly/browser";

type ScenarioName =
  | "single-target"
  | "same-payload-two-targets"
  | "same-payload-crossing"
  | "bounded-occlusion"
  | "expected-count-batch";

interface GroundTruthObject {
  objectId: string;
  payload: string;
  format: BarcodeObservation["format"];
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface GroundTruthFrame {
  frameId: number;
  objects: readonly GroundTruthObject[];
  /** Decoder result order is deliberately independent from object identity. */
  reverseDecoderOrder?: boolean;
}

interface ScenarioDefinition {
  name: ScenarioName;
  objects: readonly string[];
  frames: readonly GroundTruthFrame[];
  tracker?: BarcodeTrackerOptions;
  batch?: BatchControllerOptions;
}

interface ObjectTrackMapping {
  frameId: number;
  objectId: string;
  trackId: string;
  physicalInstanceId: string;
  state: BarcodeTrack["state"];
  x: number;
  y: number;
}

function truth(objectId: string, payload: string, x: number, y: number, format: BarcodeObservation["format"] = "upc_a"): GroundTruthObject {
  return { objectId, payload, format, x, y, width: 12, height: 10 };
}

const scenarios: Record<ScenarioName, ScenarioDefinition> = {
  "single-target": {
    name: "single-target",
    objects: ["A"],
    frames: [
      { frameId: 1, objects: [truth("A", "SINGLE-001", 10, 24, "code_128")] },
      { frameId: 2, objects: [truth("A", "SINGLE-001", 22, 24, "code_128")] },
      { frameId: 3, objects: [truth("A", "SINGLE-001", 34, 25, "code_128")] },
      { frameId: 4, objects: [truth("A", "SINGLE-001", 46, 26, "code_128")] },
    ],
  },
  "same-payload-two-targets": {
    name: "same-payload-two-targets",
    objects: ["A", "B"],
    frames: [
      { frameId: 1, objects: [truth("A", "012345678905", 10, 16), truth("B", "012345678905", 180, 72)] },
      { frameId: 2, objects: [truth("A", "012345678905", 25, 18), truth("B", "012345678905", 165, 66)], reverseDecoderOrder: true },
      { frameId: 3, objects: [truth("A", "012345678905", 40, 22), truth("B", "012345678905", 150, 58)] },
      { frameId: 4, objects: [truth("A", "012345678905", 55, 28), truth("B", "012345678905", 135, 50)], reverseDecoderOrder: true },
    ],
  },
  "same-payload-crossing": {
    name: "same-payload-crossing",
    objects: ["A", "B"],
    frames: [
      { frameId: 1, objects: [truth("A", "CROSSING", 0, 30), truth("B", "CROSSING", 100, 30)] },
      { frameId: 2, objects: [truth("A", "CROSSING", 20, 30), truth("B", "CROSSING", 80, 30)], reverseDecoderOrder: true },
      { frameId: 3, objects: [truth("A", "CROSSING", 45, 30), truth("B", "CROSSING", 55, 30)] },
      { frameId: 4, objects: [truth("A", "CROSSING", 70, 30), truth("B", "CROSSING", 30, 30)], reverseDecoderOrder: true },
    ],
    tracker: { confirmationObservations: 1 },
  },
  "bounded-occlusion": {
    name: "bounded-occlusion",
    objects: ["A"],
    frames: [
      { frameId: 1, objects: [truth("A", "OCCLUDED", 10, 30, "data_matrix")] },
      { frameId: 2, objects: [truth("A", "OCCLUDED", 20, 30, "data_matrix")] },
      { frameId: 3, objects: [] },
      { frameId: 4, objects: [] },
      { frameId: 5, objects: [truth("A", "OCCLUDED", 50, 30, "data_matrix")] },
    ],
    tracker: { maxMissedFrames: 4 },
  },
  "expected-count-batch": {
    name: "expected-count-batch",
    objects: ["A", "B", "C"],
    frames: [
      { frameId: 1, objects: [truth("A", "BATCH-SAME", 10, 30), truth("B", "BATCH-SAME", 100, 30)] },
      { frameId: 2, objects: [truth("A", "BATCH-SAME", 12, 30), truth("B", "BATCH-SAME", 102, 30)], reverseDecoderOrder: true },
      { frameId: 3, objects: [truth("A", "BATCH-SAME", 14, 30), truth("B", "BATCH-SAME", 104, 30), truth("C", "BATCH-SAME", 190, 30)] },
      { frameId: 4, objects: [truth("A", "BATCH-SAME", 16, 30), truth("B", "BATCH-SAME", 106, 30), truth("C", "BATCH-SAME", 192, 30)], reverseDecoderOrder: true },
    ],
    batch: { mode: "expected-count", expectedCount: 3 },
  },
};

function toObservation(item: GroundTruthObject): BarcodeObservation {
  const width = item.width ?? 12;
  const height = item.height ?? 10;
  return {
    payload: item.payload,
    format: item.format,
    geometry: {
      boundingBox: { x: item.x, y: item.y, width, height },
      cornerPoints: [
        { x: item.x, y: item.y },
        { x: item.x + width, y: item.y },
        { x: item.x + width, y: item.y + height },
        { x: item.x, y: item.y + height },
      ],
      frameWidth: 240,
      frameHeight: 120,
    },
  };
}

function observedTrackFor(object: GroundTruthObject, tracks: readonly BarcodeTrack[], frameId: number): BarcodeTrack | undefined {
  return tracks.find((track) => {
    const box = track.geometry.boundingBox;
    return track.lastFrameId === frameId
      && track.payload === object.payload
      && track.format === object.format
      && box.x === object.x
      && box.y === object.y
      && box.width === (object.width ?? 12)
      && box.height === (object.height ?? 10);
  });
}

function compactTrack(track: BarcodeTrack) {
  return {
    trackId: track.trackId,
    physicalInstanceId: track.physicalInstanceId,
    payload: track.payload,
    format: track.format,
    state: track.state,
    observationCount: track.observationCount,
    missedFrameCount: track.missedFrameCount,
    firstFrameId: track.firstFrameId,
    lastFrameId: track.lastFrameId,
    x: track.geometry.boundingBox.x,
    y: track.geometry.boundingBox.y,
    velocity: track.velocity,
  };
}

function compactBatchEvent(event: BatchEvent) {
  return {
    type: event.type,
    ...(event.type === "track-added" || event.type === "track-updated" || event.type === "track-restored"
      ? { trackId: event.track.trackId }
      : {}),
    ...(event.type === "track-lost" || event.type === "track-retired" ? { trackId: event.trackId } : {}),
  };
}

function runScenario(definition: ScenarioDefinition) {
  const tracker = new BarcodeTracker({
    confirmationObservations: 2,
    maxMissedFrames: 4,
    maxTracks: 32,
    maxObservations: 32,
    ...definition.tracker,
  });
  const batch = definition.batch ? new BatchController(definition.batch) : undefined;
  const batchEvents: ReturnType<typeof compactBatchEvent>[] = [];
  batch?.onEvent((event) => batchEvents.push(compactBatchEvent(event)));

  const mappings: ObjectTrackMapping[] = [];
  const trackIdsByObject = new Map<string, Set<string>>();
  const latestTrackIdByObject = new Map<string, string>();
  const falseConfirmedTrackIds = new Set<string>();
  let identitySwitchCount = 0;
  let matchedObservationCount = 0;
  let visibleObservationCount = 0;
  let reportedCurrentTrackCount = 0;

  const frames = definition.frames.map((frame) => {
    visibleObservationCount += frame.objects.length;
    const decoderOrder = frame.reverseDecoderOrder ? [...frame.objects].reverse() : frame.objects;
    const update = tracker.update(decoderOrder.map(toObservation), frame.frameId, frame.frameId * 40);
    batch?.applyTrackerUpdate(update);

    const frameMappings = frame.objects.flatMap((object) => {
      const track = observedTrackFor(object, update.tracks, frame.frameId);
      if (!track) return [];
      matchedObservationCount += 1;
      const previous = latestTrackIdByObject.get(object.objectId);
      if (previous !== undefined && previous !== track.trackId) identitySwitchCount += 1;
      latestTrackIdByObject.set(object.objectId, track.trackId);
      const trackIds = trackIdsByObject.get(object.objectId) ?? new Set<string>();
      trackIds.add(track.trackId);
      trackIdsByObject.set(object.objectId, trackIds);
      const mapping: ObjectTrackMapping = {
        frameId: frame.frameId,
        objectId: object.objectId,
        trackId: track.trackId,
        physicalInstanceId: track.physicalInstanceId,
        state: track.state,
        x: object.x,
        y: object.y,
      };
      mappings.push(mapping);
      return [mapping];
    });
    const mappedCurrentTrackIds = new Set(frameMappings.map(({ trackId }) => trackId));
    const currentConfirmedTracks = update.tracks.filter((track) => track.lastFrameId === frame.frameId && track.state === "confirmed");
    reportedCurrentTrackCount += currentConfirmedTracks.length;
    for (const track of currentConfirmedTracks) {
      if (!mappedCurrentTrackIds.has(track.trackId)) falseConfirmedTrackIds.add(track.trackId);
    }
    const batchState = batch?.getState();
    return {
      frameId: frame.frameId,
      decoderObjectOrder: decoderOrder.map(({ objectId }) => objectId),
      visibleObjectIds: frame.objects.map(({ objectId }) => objectId),
      mappings: frameMappings,
      tracks: update.tracks.map(compactTrack),
      newTrackIds: update.newTracks.map(({ trackId }) => trackId),
      lostTrackIds: update.lostTracks.map(({ trackId }) => trackId),
      restoredTrackIds: update.restoredTracks.map(({ trackId }) => trackId),
      retiredTrackIds: update.retiredTracks.map(({ trackId }) => trackId),
      ...(batchState ? {
        batch: {
          status: batchState.status,
          confirmedPhysicalInstanceCount: batchState.confirmedPhysicalInstanceCount,
          matchedCount: batchState.matched.length,
          missingQuantity: batchState.missing.reduce((total, missing) => total + missing.quantity, 0),
          unexpectedCount: batchState.unexpected.length,
          duplicateCount: batchState.duplicate.length,
        },
      } : {}),
    };
  });

  const trackFragmentationCount = definition.objects.reduce(
    (total, objectId) => total + Math.max(0, (trackIdsByObject.get(objectId)?.size ?? 0) - 1),
    0,
  );
  const trackingStatistics = tracker.getStatistics();
  const batchState = batch?.getState();
  const batchStatistics = batch?.getStatistics();
  tracker.dispose();
  batch?.clear();
  const disposedStatistics = tracker.getStatistics();

  return {
    scenario: definition.name,
    browser: navigator.userAgent,
    groundTruthObjectCount: definition.objects.length,
    frameCount: definition.frames.length,
    groundTruth: definition.frames,
    frames,
    mappings,
    metrics: {
      identitySwitchCount,
      trackFragmentationCount,
      falseTrackCount: falseConfirmedTrackIds.size,
      matchedObservationCount,
      missedObservationCount: visibleObservationCount - matchedObservationCount,
      trackRecall: visibleObservationCount === 0 ? 1 : matchedObservationCount / visibleObservationCount,
      trackPrecision: reportedCurrentTrackCount === 0 ? 1 : (reportedCurrentTrackCount - falseConfirmedTrackIds.size) / reportedCurrentTrackCount,
    },
    trackingStatistics,
    disposal: {
      activeTrackCount: disposedStatistics.activeTrackCount,
      lostTrackCount: disposedStatistics.lostTrackCount,
      pendingObservationCount: disposedStatistics.pendingObservationCount,
    },
    ...(batchState && batchStatistics ? { batch: { state: batchState, statistics: batchStatistics, events: batchEvents } } : {}),
  };
}

export default function TrackingRuntimeTestPage() {
  const [report, setReport] = useState("running");
  useEffect(() => {
    let alive = true;
    try {
      const requested = new URLSearchParams(window.location.search).get("scenario") ?? "single-target";
      const scenario = requested in scenarios ? requested as ScenarioName : "single-target";
      const result = runScenario(scenarios[scenario]);
      if (alive) setReport(JSON.stringify(result));
    } catch (error) {
      if (alive) setReport(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return () => { alive = false; };
  }, []);
  return (
    <main>
      <h1>BarcodeTracker deterministic browser evidence</h1>
      <pre data-testid="tracking-runtime-report">{report}</pre>
    </main>
  );
}
