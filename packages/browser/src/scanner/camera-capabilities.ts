import { sdkError } from "@scanly/core";
import { cameraError } from "./camera-platform.js";
import type { AutoZoomOptions, BarcodeGeometry, CameraCapabilities, CapabilityResult } from "./types.js";

type ExtendedCapabilities = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min?: number; max?: number; step?: number };
  focusMode?: string[] | boolean;
};

type ExtendedSettings = MediaTrackSettings & { zoom?: number };

interface CameraCapabilityState {
  activeTrack: MediaStreamTrack | undefined;
  lastAppliedZoom?: number;
}

const controllerStates = new WeakMap<object, CameraCapabilityState>();

function resolveTrack(
  owner: object,
  provider: () => MediaStreamTrack | undefined,
  onSourceChanged: () => void,
): MediaStreamTrack | undefined {
  const track = provider();
  const state = controllerStates.get(owner);
  if (!state) {
    controllerStates.set(owner, { activeTrack: track });
  } else if (state.activeTrack !== track) {
    state.activeTrack = track;
    state.lastAppliedZoom = undefined;
    onSourceChanged();
  }
  return track;
}

function stateFor(owner: object): CameraCapabilityState {
  const state = controllerStates.get(owner);
  if (!state) throw new Error("Camera capability state was not initialized.");
  return state;
}

function capabilitiesFor(track: MediaStreamTrack | undefined): CameraCapabilities {
  const capabilities = track?.getCapabilities?.() as ExtendedCapabilities | undefined;
  const settings = track?.getSettings?.() as ExtendedSettings | undefined;
  const min = capabilities?.zoom?.min;
  const max = capabilities?.zoom?.max;
  const rawFocusMode = capabilities?.focusMode;
  const continuousFocus = rawFocusMode === true || (Array.isArray(rawFocusMode) && rawFocusMode.includes("continuous"));
  return {
    torch: Boolean(capabilities?.torch),
    ...(min !== undefined && max !== undefined
      ? {
          zoom: {
            min,
            max,
            ...(capabilities?.zoom?.step === undefined ? {} : { step: capabilities.zoom.step }),
            ...(settings?.zoom === undefined ? {} : { current: settings.zoom }),
          },
        }
      : {}),
    // The public boolean means requestFocus() can make the exact request it
    // promises. Other modes (for example "manual") do not imply that the
    // continuous-focus constraint is supported.
    focusMode: continuousFocus,
    ...(settings?.width === undefined ? {} : { width: settings.width }),
    ...(settings?.height === undefined ? {} : { height: settings.height }),
    ...(settings?.deviceId === undefined ? {} : { deviceId: settings.deviceId }),
  };
}

export class CameraCapabilityController {
  private lastAutoZoomAt = Number.NEGATIVE_INFINITY;
  private manualZoomOverride = false;
  private autoZoomOperation: object | undefined;

  constructor(
    private readonly track: () => MediaStreamTrack | undefined,
    private readonly autoZoom: AutoZoomOptions = {},
  ) {}

  getCapabilities(): CameraCapabilities {
    const track = resolveTrack(this, this.track, () => {
      this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
      this.manualZoomOverride = false;
      this.autoZoomOperation = undefined;
    });
    return capabilitiesFor(track);
  }

  async setTorch(enabled: boolean): Promise<CapabilityResult<boolean>> {
    const track = resolveTrack(this, this.track, () => {
      this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
      this.manualZoomOverride = false;
      this.autoZoomOperation = undefined;
    });
    if (!track || !capabilitiesFor(track).torch) {
      return this.unsupported("Torch is not supported by the active camera track.");
    }
    try {
      await track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] });
      return { ok: true, value: enabled };
    } catch (error) {
      return { ok: false, error: cameraError(error, "Unable to update camera torch.") };
    }
  }

  async setZoom(value: number, manual = true): Promise<CapabilityResult<number>> {
    const track = resolveTrack(this, this.track, () => {
      this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
      this.manualZoomOverride = false;
      this.autoZoomOperation = undefined;
    });
    const zoom = capabilitiesFor(track).zoom;
    if (!track || !zoom) {
      return this.unsupported("Zoom is not supported by the active camera track.");
    }
    if (!Number.isFinite(value) || value < zoom.min || value > zoom.max) {
      return { ok: false, error: sdkError("invalid_configuration", `Zoom must be between ${zoom.min} and ${zoom.max}.`) };
    }
    try {
      await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
      // A track can be switched while applyConstraints() is pending. Do not
      // carry an old track's zoom state or manual override into the new source.
      if (stateFor(this).activeTrack === track) {
        stateFor(this).lastAppliedZoom = value;
        this.manualZoomOverride = manual;
      }
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: cameraError(error, "Unable to update camera zoom.") };
    }
  }

  async requestFocus(): Promise<CapabilityResult<boolean>> {
    const track = resolveTrack(this, this.track, () => {
      this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
      this.manualZoomOverride = false;
      this.autoZoomOperation = undefined;
    });
    if (!track || !capabilitiesFor(track).focusMode) {
      return this.unsupported("Focus control is not supported by the active camera track.");
    }
    try {
      await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
      return { ok: true, value: true };
    } catch (error) {
      return { ok: false, error: cameraError(error, "Unable to request camera focus.") };
    }
  }

  async considerAutoZoom(
    geometry: BarcodeGeometry,
    frame: { width: number; height: number },
    now = Date.now(),
  ): Promise<CapabilityResult<number> | undefined> {
    const track = resolveTrack(this, this.track, () => {
      this.lastAutoZoomAt = Number.NEGATIVE_INFINITY;
      this.manualZoomOverride = false;
      this.autoZoomOperation = undefined;
    });
    const cooldownMs = Math.max(0, this.autoZoom.cooldownMs ?? 1_500);
    if (
      this.autoZoom.enabled === false
      || this.manualZoomOverride
      || this.autoZoomOperation !== undefined
      || now - this.lastAutoZoomAt < cooldownMs
    ) return undefined;

    const zoom = capabilitiesFor(track).zoom;
    if (!track || !zoom) return undefined;
    const frameArea = Math.max(1, frame.width * frame.height);
    const barcodeArea = Math.max(0, geometry.boundingBox.width) * Math.max(0, geometry.boundingBox.height);
    if (barcodeArea / frameArea >= (this.autoZoom.minimumBarcodeAreaRatio ?? 0.04)) return undefined;

    // Some browsers update getSettings().zoom asynchronously. Remembering the
    // last successful constraint prevents repeated requests for the same value.
    const current = Math.min(zoom.max, Math.max(zoom.min, stateFor(this).lastAppliedZoom ?? zoom.current ?? zoom.min));
    const configuredDelta = this.autoZoom.maximumZoomDelta ?? 0.5;
    const delta = Number.isFinite(configuredDelta) ? Math.max(0, configuredDelta) : 0;
    const next = Math.min(zoom.max, current + delta);
    if (next <= current) return undefined;

    // Reserve the cooldown before awaiting applyConstraints so concurrent frame
    // observations cannot issue duplicate zoom requests.
    const previousAutoZoomAt = this.lastAutoZoomAt;
    const operation = {};
    this.lastAutoZoomAt = now;
    this.autoZoomOperation = operation;
    try {
      const result = await this.setZoom(next, false);
      if (!result.ok && this.autoZoomOperation === operation) this.lastAutoZoomAt = previousAutoZoomAt;
      return result;
    } finally {
      if (this.autoZoomOperation === operation) this.autoZoomOperation = undefined;
    }
  }

  clearManualZoomOverride(): void {
    this.manualZoomOverride = false;
  }

  private unsupported<T>(message: string): CapabilityResult<T> {
    return { ok: false, error: sdkError("camera_capability_unsupported", message) };
  }
}
