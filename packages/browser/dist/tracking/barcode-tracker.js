import { associateTracks, DEFAULT_ASSOCIATION_THRESHOLD } from "./track-association.js";
import { cloneGeometry, geometryCenter, isFiniteGeometry } from "./geometry.js";
const DEFAULT_MAX_TRACKS = 32;
const DEFAULT_MAX_OBSERVATIONS = 32;
const DEFAULT_CONFIRMATION_OBSERVATIONS = 2;
const DEFAULT_MAX_MISSED_FRAMES = 4;
const DEFAULT_VELOCITY_SMOOTHING = 0.65;
/** Deterministic, bounded multi-barcode physical-instance tracker. */
export class BarcodeTracker {
    options;
    tracks = new Map();
    associationLatencies = [];
    sequence = 0;
    lastProcessedFrameId;
    pendingObservationCount = 0;
    statistics = {
        processedFrames: 0,
        receivedObservations: 0,
        consideredObservations: 0,
        ignoredObservations: 0,
        matchedObservationCount: 0,
        createdTrackCount: 0,
        confirmedTrackCount: 0,
        lostTransitionCount: 0,
        restoredTrackCount: 0,
        retiredTrackCount: 0,
        peakTrackCount: 0,
    };
    constructor(options = {}) {
        this.options = {
            maxTracks: positiveInteger(options.maxTracks ?? options.maxTrackedBarcodes, DEFAULT_MAX_TRACKS),
            maxObservations: positiveInteger(options.maxObservations, DEFAULT_MAX_OBSERVATIONS),
            associationThreshold: nonNegative(options.associationThreshold, DEFAULT_ASSOCIATION_THRESHOLD),
            confirmationObservations: positiveInteger(options.confirmationObservations, DEFAULT_CONFIRMATION_OBSERVATIONS),
            maxMissedFrames: nonNegativeInteger(options.maxMissedFrames, DEFAULT_MAX_MISSED_FRAMES),
            velocitySmoothing: unitInterval(options.velocitySmoothing, DEFAULT_VELOCITY_SMOOTHING),
            ...(options.association ? { association: { ...options.association } } : {}),
        };
    }
    update(observations, frameOrId, timestamp = Date.now()) {
        const frame = typeof frameOrId === "number" ? { frameId: frameOrId, timestamp } : frameOrId;
        this.validateFrame(frame);
        this.statistics.processedFrames += 1;
        this.statistics.receivedObservations += observations.length;
        this.pendingObservationCount = Math.min(observations.length, this.options.maxObservations);
        const bounded = observations.slice(0, this.options.maxObservations);
        const considered = bounded.filter((observation) => observation.payload.length > 0 && isFiniteGeometry(observation.geometry));
        let ignoredObservationCount = observations.length - considered.length;
        this.statistics.consideredObservations += considered.length;
        const retiredBeforeAssociation = [];
        const currentTracks = [...this.tracks.values()].filter((track) => {
            const unseenFramesBeforeCurrent = Math.max(0, frame.frameId - track.lastFrameId - 1);
            if (unseenFramesBeforeCurrent <= this.options.maxMissedFrames)
                return true;
            track.missedFrameCount = unseenFramesBeforeCurrent;
            track.evaluatedFrameId = frame.frameId;
            track.state = "retired";
            retiredBeforeAssociation.push(snapshot(track));
            this.tracks.delete(track.trackId);
            this.statistics.retiredTrackCount += 1;
            return false;
        });
        const started = monotonicNow();
        const association = associateTracks(currentTracks, considered, frame.frameId, {
            threshold: this.options.associationThreshold,
            weights: this.options.association,
            timestamp: frame.timestamp,
        });
        this.recordAssociationLatency(monotonicNow() - started);
        const matchedTracks = [];
        const updatedTracks = [];
        const restoredTracks = [];
        const lostTracks = [];
        const retiredTracks = [...retiredBeforeAssociation];
        const newTracks = [];
        for (const match of association.matches) {
            const track = currentTracks[match.trackIndex];
            const observation = considered[match.observationIndex];
            if (!track || !observation)
                continue;
            const previousState = track.state;
            const wasConfirmed = track.everConfirmed;
            this.applyObservation(track, observation, frame);
            if (!wasConfirmed && track.everConfirmed)
                this.statistics.confirmedTrackCount += 1;
            if (previousState === "lost") {
                restoredTracks.push(snapshot(track));
                this.statistics.restoredTrackCount += 1;
            }
            const publicTrack = snapshot(track);
            matchedTracks.push(publicTrack);
            updatedTracks.push(publicTrack);
            this.statistics.matchedObservationCount += 1;
        }
        for (const trackIndex of association.unmatchedTrackIndices) {
            const track = currentTracks[trackIndex];
            if (!track)
                continue;
            const priorState = track.state;
            const frameDelta = Math.max(1, frame.frameId - track.evaluatedFrameId);
            track.evaluatedFrameId = frame.frameId;
            track.missedFrameCount += frameDelta;
            if (track.missedFrameCount > this.options.maxMissedFrames) {
                track.state = "retired";
                retiredTracks.push(snapshot(track));
                this.tracks.delete(track.trackId);
                this.statistics.retiredTrackCount += 1;
            }
            else {
                track.state = "lost";
                if (priorState !== "lost") {
                    lostTracks.push(snapshot(track));
                    this.statistics.lostTransitionCount += 1;
                }
            }
        }
        const availableSlots = Math.max(0, this.options.maxTracks - this.tracks.size);
        const observationsToCreate = association.unmatchedObservationIndices.slice(0, availableSlots);
        ignoredObservationCount += association.unmatchedObservationIndices.length - observationsToCreate.length;
        this.statistics.ignoredObservations += ignoredObservationCount;
        for (const observationIndex of observationsToCreate) {
            const observation = considered[observationIndex];
            if (!observation)
                continue;
            const track = this.createTrack(observation, frame);
            this.tracks.set(track.trackId, track);
            newTracks.push(snapshot(track));
            this.statistics.createdTrackCount += 1;
            if (track.everConfirmed)
                this.statistics.confirmedTrackCount += 1;
        }
        this.lastProcessedFrameId = frame.frameId;
        this.pendingObservationCount = 0;
        this.statistics.peakTrackCount = Math.max(this.statistics.peakTrackCount, this.tracks.size);
        const tracks = this.getTracks();
        return {
            frameId: frame.frameId,
            timestamp: frame.timestamp,
            matchedTracks,
            newTracks,
            updatedTracks,
            lostTracks,
            restoredTracks,
            retiredTracks,
            tracks,
            ignoredObservationCount,
            association,
        };
    }
    /** Alias that emphasizes the required one-complete-observation-set-per-frame contract. */
    observeFrame(observations, frame) {
        return this.update(observations, frame);
    }
    getTracks() {
        return [...this.tracks.values()].map(snapshot);
    }
    getTrack(trackId) {
        const track = this.tracks.get(trackId);
        return track ? snapshot(track) : undefined;
    }
    get size() { return this.tracks.size; }
    get lostSize() { return [...this.tracks.values()].filter((track) => track.state === "lost").length; }
    getStatistics() {
        return {
            ...this.statistics,
            activeTrackCount: this.tracks.size,
            lostTrackCount: this.lostSize,
            pendingObservationCount: this.pendingObservationCount,
            associationP50Ms: percentile(this.associationLatencies, 0.5),
            associationP95Ms: percentile(this.associationLatencies, 0.95),
        };
    }
    reset() {
        this.tracks.clear();
        this.associationLatencies.length = 0;
        this.lastProcessedFrameId = undefined;
        this.pendingObservationCount = 0;
    }
    dispose() { this.reset(); }
    createTrack(observation, frame) {
        const sequence = ++this.sequence;
        const confirmed = this.options.confirmationObservations <= 1;
        return {
            trackId: `track-${sequence}`,
            physicalInstanceId: `physical-${sequence}`,
            payload: observation.payload,
            format: observation.format,
            state: confirmed ? "confirmed" : "tentative",
            firstSeenAt: frame.timestamp,
            lastSeenAt: frame.timestamp,
            firstFrameId: frame.frameId,
            lastFrameId: frame.frameId,
            observationCount: 1,
            missedFrameCount: 0,
            geometry: cloneGeometry(observation.geometry),
            everConfirmed: confirmed,
            evaluatedFrameId: frame.frameId,
        };
    }
    applyObservation(track, observation, frame) {
        const oldCenter = geometryCenter(track.geometry);
        const newCenter = geometryCenter(observation.geometry);
        const frameDelta = Math.max(1, frame.frameId - track.lastFrameId);
        const measured = { x: (newCenter.x - oldCenter.x) / frameDelta, y: (newCenter.y - oldCenter.y) / frameDelta };
        const alpha = this.options.velocitySmoothing;
        track.velocity = track.velocity
            ? {
                x: measured.x * alpha + track.velocity.x * (1 - alpha),
                y: measured.y * alpha + track.velocity.y * (1 - alpha),
            }
            : measured;
        track.lastSeenAt = frame.timestamp;
        track.lastFrameId = frame.frameId;
        track.evaluatedFrameId = frame.frameId;
        track.observationCount += 1;
        track.missedFrameCount = 0;
        track.geometry = cloneGeometry(observation.geometry);
        if (track.everConfirmed || track.observationCount >= this.options.confirmationObservations) {
            track.everConfirmed = true;
            track.state = "confirmed";
        }
        else {
            track.state = "tentative";
        }
    }
    validateFrame(frame) {
        if (!Number.isInteger(frame.frameId) || frame.frameId < 0)
            throw new RangeError("Tracking frameId must be a non-negative integer.");
        if (!Number.isFinite(frame.timestamp))
            throw new RangeError("Tracking timestamp must be finite.");
        if (this.lastProcessedFrameId !== undefined && frame.frameId <= this.lastProcessedFrameId) {
            throw new RangeError("BarcodeTracker requires one complete observation set per monotonically increasing frameId.");
        }
    }
    recordAssociationLatency(value) {
        this.associationLatencies.push(Math.max(0, value));
        if (this.associationLatencies.length > 512)
            this.associationLatencies.shift();
    }
}
function snapshot(track) {
    return {
        trackId: track.trackId,
        physicalInstanceId: track.physicalInstanceId,
        payload: track.payload,
        format: track.format,
        state: track.state,
        firstSeenAt: track.firstSeenAt,
        lastSeenAt: track.lastSeenAt,
        firstFrameId: track.firstFrameId,
        lastFrameId: track.lastFrameId,
        observationCount: track.observationCount,
        missedFrameCount: track.missedFrameCount,
        geometry: cloneGeometry(track.geometry),
        ...(track.velocity ? { velocity: { ...track.velocity } } : {}),
    };
}
function monotonicNow() {
    return typeof performance === "undefined" ? Date.now() : performance.now();
}
function percentile(values, quantile) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] ?? 0;
}
function positiveInteger(value, fallback) {
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(1, Math.floor(value));
}
function nonNegativeInteger(value, fallback) {
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.floor(value));
}
function nonNegative(value, fallback) {
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value);
}
function unitInterval(value, fallback) {
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.min(1, value));
}
//# sourceMappingURL=barcode-tracker.js.map