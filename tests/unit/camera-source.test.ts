import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  callback: null as null | ((result: { getText(): string } | undefined, error: unknown, controls: { stop(): void }) => void),
  decode: vi.fn(),
  list: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    static listVideoInputDevices = state.list;
    decodeFromVideoDevice(deviceId: string | undefined, video: HTMLVideoElement, callback: typeof state.callback) {
      state.callback = callback;
      return state.decode(deviceId, video, callback);
    }
  },
}));

import { BrowserCameraSource } from "../../packages/browser/src/camera-source";

class FakeMediaStream {
  constructor(private readonly tracks: Array<{ stop(): void }>) {}
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks; }
}

afterEach(() => {
  vi.clearAllMocks();
  state.callback = null;
  vi.unstubAllGlobals();
});

describe("BrowserCameraSource abstraction", () => {
  it("lists devices, reports a result, suppresses immediate duplicates, and cleans tracks", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    state.list.mockResolvedValue([{ deviceId: "rear" }]);
    expect(await BrowserCameraSource.listDevices()).toHaveLength(1);
    const trackStop = vi.fn();
    const video = { srcObject: new FakeMediaStream([{ stop: trackStop }]) } as unknown as HTMLVideoElement;
    const results = vi.fn();
    const states: string[] = [];
    state.decode.mockResolvedValue({ stop: state.stop });
    const source = new BrowserCameraSource();
    await source.start(video, { stopAfterResult: false, onResult: results, onStateChange: (next) => states.push(next) });
    state.callback?.({ getText: () => "CAMERA_RESULT" }, undefined, { stop: state.stop });
    state.callback?.({ getText: () => "CAMERA_RESULT" }, undefined, { stop: state.stop });
    expect(results).toHaveBeenCalledOnce();
    expect(results.mock.calls[0][0].ok).toBe(true);
    expect(states).toContain("running");
    source.stop();
    expect(trackStop).toHaveBeenCalled();
  });

  it("maps permission failures and stops the partial source", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const failure = new Error("NotAllowedError: Permission denied");
    state.decode.mockRejectedValue(failure);
    const onError = vi.fn();
    const source = new BrowserCameraSource();
    await expect(source.start({ srcObject: null } as HTMLVideoElement, { onResult: vi.fn(), onError })).rejects.toBe(failure);
    expect(onError.mock.calls[0][0].error.code).toBe("camera_permission_denied");
  });

  it("detects and applies torch/zoom capabilities and switches devices", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const track = { stop: vi.fn(), getCapabilities: () => ({ torch: true, zoom: { min: 1, max: 4 } }), getSettings: () => ({ zoom: 2 }), applyConstraints };
    const video = { srcObject: new FakeMediaStream([track]) } as unknown as HTMLVideoElement;
    state.decode.mockResolvedValue({ stop: state.stop });
    const source = new BrowserCameraSource();
    await source.start(video, { deviceId: "one", onResult: vi.fn() });
    expect(source.getCapabilities()).toEqual({ torch: true, minZoom: 1, maxZoom: 4, currentZoom: 2 });
    await source.setTorch(true);
    await source.setZoom(3);
    expect(applyConstraints).toHaveBeenCalledTimes(2);
    video.srcObject = new FakeMediaStream([track]) as unknown as MediaStream;
    await source.switchDevice("two");
    expect(state.decode).toHaveBeenLastCalledWith("two", video, expect.any(Function));
    source.dispose();
  });

  it("rejects unsupported or out-of-range capabilities", async () => {
    vi.stubGlobal("MediaStream", FakeMediaStream);
    const track = { stop: vi.fn(), getCapabilities: () => ({}), getSettings: () => ({}), applyConstraints: vi.fn() };
    const video = { srcObject: new FakeMediaStream([track]) } as unknown as HTMLVideoElement;
    state.decode.mockResolvedValue({ stop: state.stop });
    const source = new BrowserCameraSource();
    await source.start(video, { onResult: vi.fn() });
    await expect(source.setTorch(true)).rejects.toThrow(/not supported/);
    await expect(source.setZoom(2)).rejects.toThrow(/not supported/);
  });
});
