import type { BarcodeTrack, TrackOverlayModel } from "./types.js";

export function createTrackOverlayModel(track: BarcodeTrack): TrackOverlayModel {
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

export function createTrackOverlayModels(tracks: readonly BarcodeTrack[]): readonly TrackOverlayModel[] {
  return tracks.map(createTrackOverlayModel);
}
