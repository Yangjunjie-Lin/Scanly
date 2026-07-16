import type { NormalizedFrame } from "@scanly/core";

export interface SerializedNormalizedFrame {
  id: string;
  timestampMs: number;
  width: number;
  height: number;
  rowStride: number;
  pixelFormat: NormalizedFrame["pixelFormat"];
  orientation: NormalizedFrame["orientation"];
  sourceType: NormalizedFrame["sourceType"];
  buffer: ArrayBuffer;
}

export function toTransferableFrame(frame: NormalizedFrame): { serialized: SerializedNormalizedFrame; transfer: Transferable[] } {
  const backing = frame.data.buffer;
  const transferable = backing instanceof ArrayBuffer && frame.data.byteOffset === 0 && frame.data.byteLength === backing.byteLength
    ? backing
    : frame.data.slice().buffer;
  return {
    serialized: {
      id: frame.id,
      timestampMs: frame.timestampMs,
      width: frame.width,
      height: frame.height,
      rowStride: frame.rowStride,
      pixelFormat: frame.pixelFormat,
      orientation: frame.orientation,
      sourceType: frame.sourceType,
      buffer: transferable,
    },
    transfer: [transferable],
  };
}

export function fromTransferableFrame(frame: SerializedNormalizedFrame): NormalizedFrame {
  return { ...frame, data: new Uint8ClampedArray(frame.buffer), ownership: "transferred" };
}
