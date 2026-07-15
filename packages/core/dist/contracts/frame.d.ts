export type FramePixelFormat = "rgba8888" | "rgb888" | "gray8" | "yuv420";
export type FrameSourceType = "camera" | "upload" | "pixel-buffer" | "video-frame" | "hardware-scanner";
export type FrameBufferOwnership = "borrowed" | "transferred" | "owned";
export type FrameOrientation = 0 | 90 | 180 | 270;
export interface FrameDeviceMetadata {
    deviceId?: string;
    label?: string;
    facingMode?: "user" | "environment" | "left" | "right";
    platform?: string;
    torchActive?: boolean;
    zoom?: number;
    hardwareScannerId?: string;
    [key: string]: string | number | boolean | undefined;
}
export interface NormalizedFrame {
    id: string;
    timestampMs: number;
    width: number;
    height: number;
    rowStride: number;
    pixelFormat: FramePixelFormat;
    orientation: FrameOrientation;
    sourceType: FrameSourceType;
    data: Uint8Array | Uint8ClampedArray;
    ownership: FrameBufferOwnership;
    device?: FrameDeviceMetadata;
    dispose?: () => void;
}
export interface FrameValidationIssue {
    path: string;
    message: string;
}
export declare function bytesPerPixel(format: FramePixelFormat): number | null;
export declare function validateFrame(frame: unknown): FrameValidationIssue[];
export declare function createRgbaFrame(data: Uint8ClampedArray, width: number, height: number, options?: Partial<Omit<NormalizedFrame, "data" | "width" | "height" | "pixelFormat" | "rowStride">>): NormalizedFrame;
//# sourceMappingURL=frame.d.ts.map