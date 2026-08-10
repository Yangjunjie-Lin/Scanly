import type { BarcodeTrack, BarcodeTrackerUpdate } from "../tracking/types.js";
import type {
  BatchEvent,
  BatchEventListener,
  BatchMatchedItem,
  BatchMissingItem,
  BatchMode,
  BatchState,
  BatchStatistics,
  BatchUnsubscribe,
  ExpectedBatchItem,
  TrackEvent,
  TrackListener,
} from "./types.js";

export interface BatchControllerOptions {
  mode?: BatchMode;
  expectedCount?: number;
  expected?: readonly ExpectedBatchItem[];
}

interface ExpectedSlot {
  item: ExpectedBatchItem;
  quantity: number;
  physicalInstanceIds: string[];
}

type Classification =
  | { kind: "matched"; slot: ExpectedSlot }
  | { kind: "duplicate"; slot: ExpectedSlot }
  | { kind: "unexpected" };

/**
 * Pure batch state machine. It consumes tracker updates and never counts raw
 * decoder events, so repeated observations cannot complete a batch early.
 */
export class BatchController {
  private readonly mode: BatchMode;
  private readonly expectedCount?: number;
  private readonly expectedSlots: ExpectedSlot[];
  private readonly tracks = new Map<string, BarcodeTrack>();
  private readonly confirmedByPhysicalInstance = new Map<string, BarcodeTrack>();
  private readonly unexpectedByPhysicalInstance = new Map<string, BarcodeTrack>();
  private readonly duplicateByPhysicalInstance = new Map<string, BarcodeTrack>();
  private readonly trackListeners = new Set<TrackListener>();
  private readonly eventListeners = new Set<BatchEventListener>();
  private status: BatchState["status"] = "collecting";
  private completedAt?: number;
  private failureReason?: string;
  private counters = {
    trackAddedEvents: 0,
    trackUpdatedEvents: 0,
    trackLostEvents: 0,
    trackRestoredEvents: 0,
    trackRetiredEvents: 0,
    batchCompletedEvents: 0,
  };

  constructor(options: BatchControllerOptions = {}) {
    this.mode = options.mode ?? "continuous";
    this.expectedCount = validateExpectedCount(this.mode, options.expectedCount);
    this.expectedSlots = validateExpectedItems(this.mode, options.expected);
  }

  getTracks(): readonly BarcodeTrack[] {
    return [...this.tracks.values()].map(cloneTrack);
  }

  getState(): BatchState {
    const matched = this.matchedItems();
    const missing = this.missingItems();
    return {
      mode: this.mode,
      status: this.status,
      ...(this.expectedCount === undefined ? {} : { expectedCount: this.expectedCount }),
      confirmedPhysicalInstanceCount: this.confirmedByPhysicalInstance.size,
      matched,
      missing,
      unexpected: [...this.unexpectedByPhysicalInstance.values()].map(cloneTrack),
      duplicate: [...this.duplicateByPhysicalInstance.values()].map(cloneTrack),
      ...(this.completedAt === undefined ? {} : { completedAt: this.completedAt }),
      ...(this.failureReason === undefined ? {} : { failureReason: this.failureReason }),
    };
  }

  getStatistics(): BatchStatistics {
    const state = this.getState();
    const matchedQuantity = state.matched.length;
    const missingQuantity = state.missing.reduce((total, entry) => total + entry.quantity, 0);
    const objective = this.mode === "checklist"
      ? matchedQuantity + missingQuantity
      : this.expectedCount;
    const progress = this.mode === "checklist" ? matchedQuantity : state.confirmedPhysicalInstanceCount;
    return {
      confirmedPhysicalInstanceCount: state.confirmedPhysicalInstanceCount,
      matchedQuantity,
      missingQuantity,
      unexpectedQuantity: state.unexpected.length,
      duplicateQuantity: state.duplicate.length,
      ...this.counters,
      completionAccuracy: objective === undefined || objective === 0
        ? 0
        : Math.min(1, progress / objective),
    };
  }

  onTrack(listener: TrackListener): BatchUnsubscribe {
    this.trackListeners.add(listener);
    return () => this.trackListeners.delete(listener);
  }

  onEvent(listener: BatchEventListener): BatchUnsubscribe {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Apply one complete, frame-level BarcodeTracker update. */
  applyTrackerUpdate(update: BarcodeTrackerUpdate): void {
    if (this.status === "failed" || this.status === "cancelled") return;

    const emittedTrackIds = new Set<string>();
    for (const track of update.newTracks) {
      this.upsertTrack(track);
      this.emitTrack({ type: "track-added", track: cloneTrack(track) });
      emittedTrackIds.add(track.trackId);
    }
    for (const track of update.restoredTracks) {
      this.upsertTrack(track);
      this.emitTrack({ type: "track-restored", track: cloneTrack(track) });
      emittedTrackIds.add(track.trackId);
    }
    for (const track of update.lostTracks) {
      this.upsertTrack(track);
      this.emitTrack({ type: "track-lost", trackId: track.trackId, track: cloneTrack(track) });
      emittedTrackIds.add(track.trackId);
    }
    for (const track of update.retiredTracks) {
      this.tracks.delete(track.trackId);
      this.emitTrack({ type: "track-retired", trackId: track.trackId, track: cloneTrack(track) });
      emittedTrackIds.add(track.trackId);
    }
    for (const track of update.updatedTracks) {
      this.upsertTrack(track);
      if (!emittedTrackIds.has(track.trackId)) {
        this.emitTrack({ type: "track-updated", track: cloneTrack(track) });
        emittedTrackIds.add(track.trackId);
      }
    }

    // `tracks` is authoritative for the latest non-retired snapshots. This
    // also makes the controller tolerant of tracker implementations that only
    // populate a subset of transition arrays.
    for (const track of update.tracks) {
      const prior = this.tracks.get(track.trackId);
      this.upsertTrack(track);
      if (!prior && !emittedTrackIds.has(track.trackId)) {
        this.emitTrack({ type: "track-added", track: cloneTrack(track) });
      }
      if (track.state === "confirmed") this.confirmPhysicalTrack(track);
    }

    this.completeIfSatisfied(update.timestamp);
  }

  /**
   * Convenience for adapters/tests that already own stable tracker snapshots.
   * Each supplied confirmed track is still de-duplicated by physical identity.
   */
  applyTracks(tracks: readonly BarcodeTrack[], timestamp = Date.now()): void {
    if (this.status === "failed" || this.status === "cancelled") return;
    for (const track of tracks) {
      const prior = this.tracks.get(track.trackId);
      this.upsertTrack(track);
      if (!prior) this.emitTrack({ type: "track-added", track: cloneTrack(track) });
      else if (prior.state === "lost" && track.state === "confirmed") {
        this.emitTrack({ type: "track-restored", track: cloneTrack(track) });
      } else if (prior.state !== "lost" && track.state === "lost") {
        this.emitTrack({ type: "track-lost", trackId: track.trackId, track: cloneTrack(track) });
      } else {
        this.emitTrack({ type: "track-updated", track: cloneTrack(track) });
      }
      if (track.state === "confirmed") this.confirmPhysicalTrack(track);
    }
    this.completeIfSatisfied(timestamp);
  }

  cancel(): void {
    if (this.status !== "collecting") return;
    this.status = "cancelled";
    this.emit({ type: "batch-cancelled", state: this.getState() });
  }

  fail(error: unknown): void {
    if (this.status === "complete" || this.status === "failed" || this.status === "cancelled") return;
    this.status = "failed";
    this.failureReason = error instanceof Error ? error.message : String(error);
    this.emit({ type: "batch-failed", state: this.getState(), error });
  }

  reset(): void {
    this.tracks.clear();
    this.confirmedByPhysicalInstance.clear();
    this.unexpectedByPhysicalInstance.clear();
    this.duplicateByPhysicalInstance.clear();
    for (const slot of this.expectedSlots) slot.physicalInstanceIds = [];
    this.status = "collecting";
    this.completedAt = undefined;
    this.failureReason = undefined;
    this.counters = {
      trackAddedEvents: 0,
      trackUpdatedEvents: 0,
      trackLostEvents: 0,
      trackRestoredEvents: 0,
      trackRetiredEvents: 0,
      batchCompletedEvents: 0,
    };
  }

  clear(): void {
    this.reset();
    this.trackListeners.clear();
    this.eventListeners.clear();
  }

  private upsertTrack(track: BarcodeTrack): void {
    this.tracks.set(track.trackId, cloneTrack(track));
    const existing = this.confirmedByPhysicalInstance.get(track.physicalInstanceId);
    if (existing) this.confirmedByPhysicalInstance.set(track.physicalInstanceId, cloneTrack(track));
    if (this.unexpectedByPhysicalInstance.has(track.physicalInstanceId)) {
      this.unexpectedByPhysicalInstance.set(track.physicalInstanceId, cloneTrack(track));
    }
    if (this.duplicateByPhysicalInstance.has(track.physicalInstanceId)) {
      this.duplicateByPhysicalInstance.set(track.physicalInstanceId, cloneTrack(track));
    }
  }

  private confirmPhysicalTrack(track: BarcodeTrack): void {
    const physicalInstanceId = track.physicalInstanceId.trim();
    if (!physicalInstanceId) throw new Error("A confirmed BarcodeTrack requires a physicalInstanceId.");
    const prior = this.confirmedByPhysicalInstance.get(physicalInstanceId);
    if (prior) {
      if (prior.payload !== track.payload || prior.format !== track.format) {
        throw new Error(`Physical instance ${physicalInstanceId} changed barcode identity.`);
      }
      this.confirmedByPhysicalInstance.set(physicalInstanceId, cloneTrack(track));
      return;
    }

    const snapshot = cloneTrack(track);
    this.confirmedByPhysicalInstance.set(physicalInstanceId, snapshot);
    if (this.mode !== "checklist") return;

    const classification = this.classifyChecklistTrack(snapshot);
    if (classification.kind === "matched") {
      classification.slot.physicalInstanceIds.push(physicalInstanceId);
      this.emit({ type: "item-matched", item: cloneItem(classification.slot.item), track: snapshot });
    } else if (classification.kind === "duplicate") {
      this.duplicateByPhysicalInstance.set(physicalInstanceId, snapshot);
      this.emit({ type: "duplicate-item", item: cloneItem(classification.slot.item), track: snapshot });
    } else {
      this.unexpectedByPhysicalInstance.set(physicalInstanceId, snapshot);
      this.emit({ type: "unexpected-item", track: snapshot });
    }
  }

  private classifyChecklistTrack(track: BarcodeTrack): Classification {
    const candidates = this.expectedSlots
      .filter((slot) => slot.item.payload === track.payload && (slot.item.format === undefined || slot.item.format === track.format))
      .sort((left, right) => Number(right.item.format === track.format) - Number(left.item.format === track.format));
    const available = candidates.find((slot) => slot.physicalInstanceIds.length < slot.quantity);
    if (available) return { kind: "matched", slot: available };
    return candidates[0] ? { kind: "duplicate", slot: candidates[0] } : { kind: "unexpected" };
  }

  private completeIfSatisfied(timestamp: number): void {
    if (this.status !== "collecting") return;
    const complete = this.mode === "checklist"
      ? this.expectedSlots.every((slot) => slot.physicalInstanceIds.length === slot.quantity)
      : (this.mode === "expected-count" || this.mode === "unique-physical-instance")
        && this.expectedCount !== undefined
        && this.confirmedByPhysicalInstance.size >= this.expectedCount;
    if (!complete) return;
    this.status = "complete";
    this.completedAt = timestamp;
    this.counters.batchCompletedEvents += 1;
    this.emit({ type: "batch-completed", state: this.getState() });
  }

  private matchedItems(): BatchMatchedItem[] {
    return this.expectedSlots.flatMap((slot) => slot.physicalInstanceIds.flatMap((id) => {
      const track = this.confirmedByPhysicalInstance.get(id);
      return track ? [{ item: cloneItem(slot.item), track: cloneTrack(track) }] : [];
    }));
  }

  private missingItems(): BatchMissingItem[] {
    return this.expectedSlots.flatMap((slot) => {
      const quantity = slot.quantity - slot.physicalInstanceIds.length;
      return quantity > 0 ? [{ item: cloneItem(slot.item), quantity }] : [];
    });
  }

  private emitTrack(event: TrackEvent): void {
    const counter = `${event.type.replaceAll("-", "")}Events`;
    if (counter === "trackaddedEvents") this.counters.trackAddedEvents += 1;
    else if (counter === "trackupdatedEvents") this.counters.trackUpdatedEvents += 1;
    else if (counter === "tracklostEvents") this.counters.trackLostEvents += 1;
    else if (counter === "trackrestoredEvents") this.counters.trackRestoredEvents += 1;
    else if (counter === "trackretiredEvents") this.counters.trackRetiredEvents += 1;
    for (const listener of this.trackListeners) {
      try { listener(event); } catch { /* observers do not own batch state */ }
    }
    this.emit(event);
  }

  private emit(event: BatchEvent): void {
    for (const listener of this.eventListeners) {
      try { listener(event); } catch { /* observers do not own batch state */ }
    }
  }
}

function validateExpectedCount(mode: BatchMode, value: number | undefined): number | undefined {
  const required = mode === "expected-count";
  if (value === undefined) {
    if (required) throw new RangeError("expected-count mode requires expectedCount.");
    return undefined;
  }
  if (!Number.isInteger(value) || value <= 0) throw new RangeError("expectedCount must be a positive integer.");
  return value;
}

function validateExpectedItems(mode: BatchMode, expected: readonly ExpectedBatchItem[] | undefined): ExpectedSlot[] {
  if (mode !== "checklist") return [];
  if (!expected?.length) throw new RangeError("checklist mode requires at least one expected item.");
  return expected.map((item) => {
    if (!item.payload) throw new RangeError("Expected batch item payload must not be empty.");
    const quantity = item.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) throw new RangeError("Expected batch item quantity must be a positive integer.");
    return { item: { ...item, quantity }, quantity, physicalInstanceIds: [] };
  });
}

function cloneItem(item: ExpectedBatchItem): ExpectedBatchItem {
  return { ...item };
}

function cloneTrack(track: BarcodeTrack): BarcodeTrack {
  return {
    ...track,
    geometry: {
      ...track.geometry,
      boundingBox: { ...track.geometry.boundingBox },
      cornerPoints: track.geometry.cornerPoints.map((point) => ({ ...point })),
    },
    ...(track.velocity ? { velocity: { ...track.velocity } } : {}),
  };
}
