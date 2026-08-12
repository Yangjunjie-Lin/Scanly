import { describe, expect, it, vi } from "vitest";
import { CameraCapabilityController } from "../../packages/browser/src/scanner/camera-capabilities";

interface FakeTrackOptions {
  torch?: boolean;
  zoom?: { min: number; max: number; step?: number };
  currentZoom?: number;
  focusMode?: string[];
  deviceId?: string;
  width?: number;
  height?: number;
  updateZoomSetting?: boolean;
  beforeApplyResolves?: () => Promise<void>;
}

function fakeTrack(options: FakeTrackOptions = {}) {
  let currentZoom = options.currentZoom;
  const applied: MediaTrackConstraints[] = [];
  const applyConstraints = vi.fn(async (constraints: MediaTrackConstraints) => {
    applied.push(constraints);
    await options.beforeApplyResolves?.();
    const zoom = (constraints.advanced?.[0] as MediaTrackConstraintSet & { zoom?: number } | undefined)?.zoom;
    if (options.updateZoomSetting !== false && zoom !== undefined) currentZoom = zoom;
  });
  const track = {
    getCapabilities: () => ({
      ...(options.torch === undefined ? {} : { torch: options.torch }),
      ...(options.zoom === undefined ? {} : { zoom: options.zoom }),
      ...(options.focusMode === undefined ? {} : { focusMode: options.focusMode }),
    }),
    getSettings: () => ({
      ...(currentZoom === undefined ? {} : { zoom: currentZoom }),
      ...(options.deviceId === undefined ? {} : { deviceId: options.deviceId }),
      ...(options.width === undefined ? {} : { width: options.width }),
      ...(options.height === undefined ? {} : { height: options.height }),
    }),
    applyConstraints,
  } as unknown as MediaStreamTrack;
  return { track, applied, applyConstraints };
}

const tinyGeometry = {
  cornerPoints: [],
  boundingBox: { x: 0, y: 0, width: 1, height: 1 },
};

function appliedZooms(applied: readonly MediaTrackConstraints[]): number[] {
  return applied.flatMap((constraints) => {
    const zoom = (constraints.advanced?.[0] as MediaTrackConstraintSet & { zoom?: number } | undefined)?.zoom;
    return zoom === undefined ? [] : [zoom];
  });
}

describe("CameraCapabilityController contract", () => {
  it("returns typed failures for unsupported torch and zoom", async () => {
    const { track, applyConstraints } = fakeTrack();
    const controller = new CameraCapabilityController(() => track);

    const torch = await controller.setTorch(true);
    expect(torch.ok).toBe(false);
    if (!torch.ok) expect(torch.error.code).toBe("camera_capability_unsupported");

    const zoom = await controller.setZoom(2);
    expect(zoom.ok).toBe(false);
    if (!zoom.ok) expect(zoom.error.code).toBe("camera_capability_unsupported");
    expect(applyConstraints).not.toHaveBeenCalled();
  });

  it("reports capabilities and applies supported torch and focus controls", async () => {
    const { track, applied } = fakeTrack({
      torch: true,
      zoom: { min: 1, max: 4, step: 0.1 },
      currentZoom: 2,
      focusMode: ["continuous"],
      deviceId: "rear",
      width: 1920,
      height: 1080,
    });
    const controller = new CameraCapabilityController(() => track);

    expect(controller.getCapabilities()).toEqual({
      torch: true,
      zoom: { min: 1, max: 4, step: 0.1, current: 2 },
      focusMode: true,
      width: 1920,
      height: 1080,
      deviceId: "rear",
    });
    expect(await controller.setTorch(true)).toEqual({ ok: true, value: true });
    expect(await controller.requestFocus()).toEqual({ ok: true, value: true });
    expect(applied).toEqual([
      { advanced: [{ torch: true }] },
      { advanced: [{ focusMode: "continuous" }] },
    ]);
  });

  it("does not advertise or request continuous focus when only other modes exist", async () => {
    const { track, applyConstraints } = fakeTrack({ focusMode: ["manual", "single-shot"] });
    const controller = new CameraCapabilityController(() => track);

    expect(controller.getCapabilities().focusMode).toBe(false);
    const result = await controller.requestFocus();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("camera_capability_unsupported");
    expect(applyConstraints).not.toHaveBeenCalled();
  });

  it("honors a manual zoom override until it is explicitly cleared", async () => {
    const { track, applied } = fakeTrack({ zoom: { min: 1, max: 4 }, currentZoom: 1 });
    const controller = new CameraCapabilityController(
      () => track,
      { enabled: true, cooldownMs: 0, maximumZoomDelta: 0.5 },
    );

    expect(await controller.setZoom(2)).toEqual({ ok: true, value: 2 });
    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 0)).toBeUndefined();
    expect(appliedZooms(applied)).toEqual([2]);

    controller.clearManualZoomOverride();
    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 0)).toEqual({ ok: true, value: 2.5 });
    expect(appliedZooms(applied)).toEqual([2, 2.5]);
  });

  it("enforces the auto zoom cooldown including its exact boundary", async () => {
    const { track, applied } = fakeTrack({ zoom: { min: 1, max: 4 }, currentZoom: 1 });
    const controller = new CameraCapabilityController(
      () => track,
      { enabled: true, cooldownMs: 1_000, maximumZoomDelta: 0.5 },
    );

    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 0)).toEqual({ ok: true, value: 1.5 });
    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 999)).toBeUndefined();
    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 1_000)).toEqual({ ok: true, value: 2 });
    expect(appliedZooms(applied)).toEqual([1.5, 2]);
  });

  it("clamps auto zoom to the camera maximum", async () => {
    const { track, applied } = fakeTrack({ zoom: { min: 1, max: 4 }, currentZoom: 3.8 });
    const controller = new CameraCapabilityController(
      () => track,
      { enabled: true, cooldownMs: 0, maximumZoomDelta: 0.5 },
    );

    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 0)).toEqual({ ok: true, value: 4 });
    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 1)).toBeUndefined();
    expect(appliedZooms(applied)).toEqual([4]);
  });

  it("never oscillates or repeats a zoom request when browser settings lag", async () => {
    const { track, applied } = fakeTrack({
      zoom: { min: 1, max: 4 },
      currentZoom: 1,
      updateZoomSetting: false,
    });
    const controller = new CameraCapabilityController(
      () => track,
      { enabled: true, cooldownMs: 0, maximumZoomDelta: 0.5 },
    );

    await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 0);
    await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 1);
    await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 2);
    expect(appliedZooms(applied)).toEqual([1.5, 2, 2.5]);

    const largeGeometry = { ...tinyGeometry, boundingBox: { x: 0, y: 0, width: 50, height: 50 } };
    expect(await controller.considerAutoZoom(largeGeometry, { width: 100, height: 100 }, 3)).toBeUndefined();
    expect(appliedZooms(applied)).toEqual([1.5, 2, 2.5]);
  });

  it("coalesces concurrent auto zoom observations even when cooldown is zero", async () => {
    let releaseApply!: () => void;
    const applyBarrier = new Promise<void>((resolve) => { releaseApply = resolve; });
    const { track, applied } = fakeTrack({
      zoom: { min: 1, max: 4 },
      currentZoom: 1,
      beforeApplyResolves: () => applyBarrier,
    });
    const controller = new CameraCapabilityController(
      () => track,
      { enabled: true, cooldownMs: 0, maximumZoomDelta: 0.5 },
    );

    const first = controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 0);
    const concurrent = controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 0);
    expect(await concurrent).toBeUndefined();
    expect(appliedZooms(applied)).toEqual([1.5]);

    releaseApply();
    expect(await first).toEqual({ ok: true, value: 1.5 });
    expect(appliedZooms(applied)).toEqual([1.5]);
  });

  it("refreshes capabilities and auto zoom policy state after a source switch", async () => {
    const first = fakeTrack({
      torch: true,
      zoom: { min: 1, max: 4 },
      currentZoom: 1,
      deviceId: "rear-wide",
    });
    const second = fakeTrack({
      torch: false,
      zoom: { min: 2, max: 3 },
      currentZoom: 2,
      deviceId: "rear-telephoto",
    });
    let activeTrack = first.track;
    const controller = new CameraCapabilityController(
      () => activeTrack,
      { enabled: true, cooldownMs: 10_000, maximumZoomDelta: 0.5 },
    );

    expect(controller.getCapabilities()).toMatchObject({ torch: true, deviceId: "rear-wide" });
    expect(await controller.setZoom(2)).toEqual({ ok: true, value: 2 });

    activeTrack = second.track;
    expect(controller.getCapabilities()).toEqual({
      torch: false,
      zoom: { min: 2, max: 3, current: 2 },
      focusMode: false,
      deviceId: "rear-telephoto",
    });
    expect(await controller.considerAutoZoom(tinyGeometry, { width: 100, height: 100 }, 1)).toEqual({ ok: true, value: 2.5 });
    expect(appliedZooms(first.applied)).toEqual([2]);
    expect(appliedZooms(second.applied)).toEqual([2.5]);
  });
});
