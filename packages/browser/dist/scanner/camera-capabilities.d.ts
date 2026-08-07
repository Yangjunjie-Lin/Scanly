import type { AutoZoomOptions, BarcodeGeometry, CameraCapabilities, CapabilityResult } from "./types.js";
export declare class CameraCapabilityController {
    private readonly track;
    private readonly autoZoom;
    private lastAutoZoomAt;
    private manualZoomOverride;
    constructor(track: () => MediaStreamTrack | undefined, autoZoom?: AutoZoomOptions);
    getCapabilities(): CameraCapabilities;
    setTorch(enabled: boolean): Promise<CapabilityResult<boolean>>;
    setZoom(value: number, manual?: boolean): Promise<CapabilityResult<number>>;
    requestFocus(): Promise<CapabilityResult<boolean>>;
    considerAutoZoom(geometry: BarcodeGeometry, frame: {
        width: number;
        height: number;
    }, now?: number): Promise<CapabilityResult<number> | undefined>;
    clearManualZoomOverride(): void;
    private unsupported;
}
//# sourceMappingURL=camera-capabilities.d.ts.map