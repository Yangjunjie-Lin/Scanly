import { geometryArea, geometryCenter, geometryDistanceScale, geometryIoU } from "./geometry.js";
export const DEFAULT_ASSOCIATION_THRESHOLD = 2.5;
export const DEFAULT_ASSOCIATION_WEIGHTS = Object.freeze({
    // Compatibility weights remain explicit in the public cost schema, while
    // the semantic eligibility gate below takes precedence over every weight.
    payloadMismatch: 8,
    formatMismatch: 8,
    spatialDistance: 0.9,
    iouPenalty: 0.35,
    geometrySize: 0.25,
    // Prediction helps at crossings, but current geometry has the larger weight.
    motionPrediction: 0.7,
    timeSinceObservation: 0.08,
});
export function calculateAssociationCost(track, observation, frameId, options = {}) {
    // Payload and format identify what was decoded, not merely how expensive a
    // spatial association should be. A semantic mismatch is never a candidate,
    // even when callers deliberately raise the threshold or zero custom weights.
    if (track.payload !== observation.payload || track.format !== observation.format) {
        return Number.POSITIVE_INFINITY;
    }
    const weights = resolveWeights(options.weights);
    const currentCenter = geometryCenter(track.geometry);
    const observedCenter = geometryCenter(observation.geometry);
    const elapsedFrames = Math.max(1, frameId - track.lastFrameId);
    const predictedCenter = track.velocity
        ? {
            x: currentCenter.x + track.velocity.x * elapsedFrames,
            y: currentCenter.y + track.velocity.y * elapsedFrames,
        }
        : currentCenter;
    const scale = geometryDistanceScale(track.geometry, observation.geometry);
    const spatialDistance = Math.hypot(observedCenter.x - currentCenter.x, observedCenter.y - currentCenter.y) / scale;
    const predictionDistance = Math.hypot(observedCenter.x - predictedCenter.x, observedCenter.y - predictedCenter.y) / scale;
    const directionConflict = motionDirectionConflict(track, currentCenter, observedCenter, elapsedFrames);
    const sizePenalty = Math.min(4, Math.abs(Math.log(geometryArea(observation.geometry) / geometryArea(track.geometry))));
    const elapsedTimeFrames = options.timestamp === undefined
        ? 0
        : Math.max(0, (options.timestamp - track.lastSeenAt) / positive(options.nominalFrameDurationMs, 1000 / 30) - 1);
    const missingFrames = Math.max(track.missedFrameCount, frameId - track.lastFrameId - 1, elapsedTimeFrames);
    const cost = spatialDistance * weights.spatialDistance
        + (1 - geometryIoU(track.geometry, observation.geometry)) * weights.iouPenalty
        + sizePenalty * weights.geometrySize
        + (predictionDistance + directionConflict) * weights.motionPrediction
        + missingFrames * weights.timeSinceObservation;
    return Number.isFinite(cost) ? cost : Number.MAX_SAFE_INTEGER;
}
function motionDirectionConflict(track, current, observed, elapsedFrames) {
    if (!track.velocity)
        return 0;
    const expectedX = track.velocity.x * elapsedFrames;
    const expectedY = track.velocity.y * elapsedFrames;
    const expectedMagnitude = Math.hypot(expectedX, expectedY);
    if (expectedMagnitude <= Number.EPSILON)
        return 0;
    const actualX = observed.x - current.x;
    const actualY = observed.y - current.y;
    const actualMagnitude = Math.hypot(actualX, actualY);
    // At a crossing, choosing the other object often looks like an implausible
    // stop at the previous position. Preserve that evidence without rejecting a
    // real stop outright: this is a soft cost and remains under the threshold.
    if (actualMagnitude < expectedMagnitude * 0.25)
        return 1;
    const cosine = Math.max(-1, Math.min(1, (actualX * expectedX + actualY * expectedY) / (actualMagnitude * expectedMagnitude)));
    return (1 - cosine) / 2;
}
/**
 * Globally minimizes the bounded track/observation cost matrix. Dummy columns
 * model an unmatched track, so an over-threshold pair can never steal a valid
 * observation from another track.
 */
export function associateTracks(tracks, observations, frameId, options = {}) {
    const threshold = nonNegative(options.threshold, DEFAULT_ASSOCIATION_THRESHOLD);
    const costMatrix = tracks.map((track) => observations.map((observation) => calculateAssociationCost(track, observation, frameId, options)));
    if (tracks.length === 0 || observations.length === 0) {
        return {
            matches: [],
            unmatchedTrackIndices: tracks.map((_, index) => index),
            unmatchedObservationIndices: observations.map((_, index) => index),
            costMatrix,
        };
    }
    // One dummy column per track guarantees columns >= rows and permits every
    // row to choose the unmatched cost independently.
    const assignmentMatrix = costMatrix.map((row) => [
        ...row,
        ...Array.from({ length: tracks.length }, () => threshold),
    ]);
    const assignedColumns = hungarianRowsToColumns(assignmentMatrix);
    const matchedObservations = new Set();
    const matches = assignedColumns.flatMap((column, trackIndex) => {
        if (column < 0 || column >= observations.length)
            return [];
        const track = tracks[trackIndex];
        const observation = observations[column];
        if (!track || !observation || track.payload !== observation.payload || track.format !== observation.format)
            return [];
        const cost = costMatrix[trackIndex]?.[column] ?? Number.MAX_SAFE_INTEGER;
        if (!Number.isFinite(cost) || cost > threshold)
            return [];
        matchedObservations.add(column);
        return [{ trackIndex, observationIndex: column, cost }];
    });
    const matchedTracks = new Set(matches.map((match) => match.trackIndex));
    return {
        matches,
        unmatchedTrackIndices: tracks.map((_, index) => index).filter((index) => !matchedTracks.has(index)),
        unmatchedObservationIndices: observations.map((_, index) => index).filter((index) => !matchedObservations.has(index)),
        costMatrix,
    };
}
function resolveWeights(input) {
    return {
        payloadMismatch: nonNegative(input?.payloadMismatch, DEFAULT_ASSOCIATION_WEIGHTS.payloadMismatch),
        formatMismatch: nonNegative(input?.formatMismatch, DEFAULT_ASSOCIATION_WEIGHTS.formatMismatch),
        spatialDistance: nonNegative(input?.spatialDistance, DEFAULT_ASSOCIATION_WEIGHTS.spatialDistance),
        iouPenalty: nonNegative(input?.iouPenalty, DEFAULT_ASSOCIATION_WEIGHTS.iouPenalty),
        geometrySize: nonNegative(input?.geometrySize, DEFAULT_ASSOCIATION_WEIGHTS.geometrySize),
        motionPrediction: nonNegative(input?.motionPrediction, DEFAULT_ASSOCIATION_WEIGHTS.motionPrediction),
        timeSinceObservation: nonNegative(input?.timeSinceObservation, DEFAULT_ASSOCIATION_WEIGHTS.timeSinceObservation),
    };
}
function nonNegative(value, fallback) {
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value);
}
function positive(value, fallback) {
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(Number.EPSILON, value);
}
/** Hungarian minimum-cost assignment for a finite matrix with rows <= columns. */
function hungarianRowsToColumns(matrix) {
    const rowCount = matrix.length;
    const columnCount = matrix[0]?.length ?? 0;
    if (rowCount === 0)
        return [];
    if (columnCount < rowCount)
        throw new RangeError("Hungarian assignment requires at least as many columns as rows.");
    const rowPotential = new Array(rowCount + 1).fill(0);
    const columnPotential = new Array(columnCount + 1).fill(0);
    const columnMatch = new Array(columnCount + 1).fill(0);
    const predecessor = new Array(columnCount + 1).fill(0);
    for (let row = 1; row <= rowCount; row += 1) {
        columnMatch[0] = row;
        let currentColumn = 0;
        const minimum = new Array(columnCount + 1).fill(Number.POSITIVE_INFINITY);
        const used = new Array(columnCount + 1).fill(false);
        do {
            used[currentColumn] = true;
            const currentRow = columnMatch[currentColumn] ?? 0;
            let delta = Number.POSITIVE_INFINITY;
            let nextColumn = 0;
            for (let column = 1; column <= columnCount; column += 1) {
                if (used[column])
                    continue;
                const raw = matrix[currentRow - 1]?.[column - 1] ?? Number.MAX_SAFE_INTEGER;
                const reduced = raw - (rowPotential[currentRow] ?? 0) - (columnPotential[column] ?? 0);
                if (reduced < (minimum[column] ?? Number.POSITIVE_INFINITY)) {
                    minimum[column] = reduced;
                    predecessor[column] = currentColumn;
                }
                if ((minimum[column] ?? Number.POSITIVE_INFINITY) < delta) {
                    delta = minimum[column] ?? Number.POSITIVE_INFINITY;
                    nextColumn = column;
                }
            }
            for (let column = 0; column <= columnCount; column += 1) {
                if (used[column]) {
                    const matchedRow = columnMatch[column] ?? 0;
                    rowPotential[matchedRow] = (rowPotential[matchedRow] ?? 0) + delta;
                    columnPotential[column] = (columnPotential[column] ?? 0) - delta;
                }
                else {
                    minimum[column] = (minimum[column] ?? Number.POSITIVE_INFINITY) - delta;
                }
            }
            currentColumn = nextColumn;
        } while ((columnMatch[currentColumn] ?? 0) !== 0);
        do {
            const nextColumn = predecessor[currentColumn] ?? 0;
            columnMatch[currentColumn] = columnMatch[nextColumn] ?? 0;
            currentColumn = nextColumn;
        } while (currentColumn !== 0);
    }
    const assignment = new Array(rowCount).fill(-1);
    for (let column = 1; column <= columnCount; column += 1) {
        const row = columnMatch[column] ?? 0;
        if (row > 0)
            assignment[row - 1] = column - 1;
    }
    return assignment;
}
//# sourceMappingURL=track-association.js.map