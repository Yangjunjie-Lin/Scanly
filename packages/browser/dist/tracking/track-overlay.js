export function createTrackOverlayModel(track) {
    return {
        trackId: track.trackId,
        physicalInstanceId: track.physicalInstanceId,
        payload: track.payload,
        format: track.format,
        state: track.state,
        boundingBox: { ...track.geometry.boundingBox },
        cornerPoints: track.geometry.cornerPoints.map((point) => ({ ...point })),
        ...(track.velocity ? { velocity: { ...track.velocity } } : {}),
    };
}
export function createTrackOverlayModels(tracks) {
    return tracks.map(createTrackOverlayModel);
}
//# sourceMappingURL=track-overlay.js.map