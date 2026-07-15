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

export function bytesPerPixel(format: FramePixelFormat): number | null {
  if (format === "rgba8888") return 4;
  if (format === "rgb888") return 3;
  if (format === "gray8") return 1;
  return null;
}

export function validateFrame(frame: unknown): FrameValidationIssue[] {
  const issues: FrameValidationIssue[] = [];
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    return [{ path: "$", message: "Frame must be an object." }];
  }
  const value = frame as Partial<NormalizedFrame> & { data?: unknown };
  if (typeof value.id !== "string" || value.id.length === 0) issues.push({ path: "id", message: "Frame id is required." });
  if (typeof value.timestampMs !== "number" || !Number.isFinite(value.timestampMs) || value.timestampMs < 0) issues.push({ path: "timestampMs", message: "Timestamp must be a non-negative finite number." });
  if (!Number.isSafeInteger(value.width) || (value.width ?? 0) < 1) issues.push({ path: "width", message: "Width must be a positive safe integer." });
  if (!Number.isSafeInteger(value.height) || (value.height ?? 0) < 1) issues.push({ path: "height", message: "Height must be a positive safe integer." });
  const pixelFormats: FramePixelFormat[] = ["rgba8888", "rgb888", "gray8", "yuv420"];
  const validPixelFormat = pixelFormats.includes(value.pixelFormat as FramePixelFormat);
  if (!validPixelFormat) issues.push({ path: "pixelFormat", message: "Pixel format must be rgba8888, rgb888, gray8, or yuv420." });
  if (![0, 90, 180, 270].includes(value.orientation as number)) issues.push({ path: "orientation", message: "Orientation must be 0, 90, 180, or 270." });
  const sourceTypes: FrameSourceType[] = ["camera", "upload", "pixel-buffer", "video-frame", "hardware-scanner"];
  if (!sourceTypes.includes(value.sourceType as FrameSourceType)) issues.push({ path: "sourceType", message: "Frame source type is invalid." });
  const ownershipValues: FrameBufferOwnership[] = ["borrowed", "transferred", "owned"];
  if (!ownershipValues.includes(value.ownership as FrameBufferOwnership)) issues.push({ path: "ownership", message: "Frame ownership must be borrowed, transferred, or owned." });
  const validData = value.data instanceof Uint8Array || value.data instanceof Uint8ClampedArray;
  const data = validData ? value.data as Uint8Array | Uint8ClampedArray : null;
  if (!validData) issues.push({ path: "data", message: "Frame data must be a Uint8Array or Uint8ClampedArray." });
  if (value.dispose !== undefined && typeof value.dispose !== "function") issues.push({ path: "dispose", message: "Frame dispose must be a function when provided." });

  if (validPixelFormat && Number.isSafeInteger(value.width) && (value.width ?? 0) > 0 && Number.isSafeInteger(value.height) && (value.height ?? 0) > 0) {
    const bpp = bytesPerPixel(value.pixelFormat as FramePixelFormat);
    const minimumStride = (value.width as number) * (bpp ?? 1);
    if (!Number.isSafeInteger(value.rowStride) || (value.rowStride ?? 0) < minimumStride) {
      issues.push({ path: "rowStride", message: `Row stride must be at least ${minimumStride} bytes for ${value.pixelFormat}.` });
    } else if (data) {
      const requiredBytes = (value.rowStride as number) * (value.height as number);
      if (!Number.isSafeInteger(requiredBytes)) {
        issues.push({ path: "data", message: "Frame dimensions and stride exceed the safe buffer-size range." });
      } else if (data.byteLength < requiredBytes) {
        issues.push({ path: "data", message: `Frame buffer has ${data.byteLength} bytes; ${requiredBytes} are required by dimensions and stride.` });
      }
    }
  }
  return issues;
}

let frameSequence = 0;

export function createRgbaFrame(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: Partial<Omit<NormalizedFrame, "data" | "width" | "height" | "pixelFormat" | "rowStride">> = {}
): NormalizedFrame {
  return {
    id: options.id ?? `frame-${Date.now()}-${++frameSequence}`,
    timestampMs: options.timestampMs ?? Date.now(),
    width,
    height,
    rowStride: width * 4,
    pixelFormat: "rgba8888",
    orientation: options.orientation ?? 0,
    sourceType: options.sourceType ?? "pixel-buffer",
    data,
    ownership: options.ownership ?? "borrowed",
    device: options.device,
    dispose: options.dispose,
  };
}
