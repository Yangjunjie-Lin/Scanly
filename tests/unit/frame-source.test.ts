import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaStreamCameraFrameSource } from "../../packages/browser/src/scanner/frame-source";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("MediaStreamCameraFrameSource", () => {
  it("stops the camera track when the track ends", async () => {
    let ended: (() => void) | undefined;
    const track = { stop: vi.fn(), addEventListener: (_: string, listener: () => void) => { ended = listener; }, removeEventListener: vi.fn(), getSettings: () => ({ deviceId: "rear" }) };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream), enumerateDevices: vi.fn().mockResolvedValue([]) } });
    vi.stubGlobal("document", { visibilityState: "visible", createElement: () => ({ width: 0, height: 0, getContext: () => null }), addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const video = { srcObject: null, play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement;
    const onEnded = vi.fn(); const source = new MediaStreamCameraFrameSource({ video });
    await source.start(() => undefined, () => undefined, onEnded); ended?.(); await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(onEnded).toHaveBeenCalledOnce(); expect(track.stop).toHaveBeenCalledOnce(); expect(video.srcObject).toBeNull();
  });

  it("returns only video input devices", async () => {
    vi.stubGlobal("navigator", { mediaDevices: { enumerateDevices: vi.fn().mockResolvedValue([{ kind: "videoinput", deviceId: "camera" }, { kind: "audioinput", deviceId: "mic" }]) } });
    expect(await MediaStreamCameraFrameSource.listDevices()).toHaveLength(1);
  });
});
