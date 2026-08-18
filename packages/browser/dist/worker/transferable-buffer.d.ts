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
export declare function toTransferableFrame(frame: NormalizedFrame, preserveSource?: boolean): {
    serialized: SerializedNormalizedFrame;
    transfer: Transferable[];
};
export declare function fromTransferableFrame(frame: SerializedNormalizedFrame): NormalizedFrame;
//# sourceMappingURL=transferable-buffer.d.ts.map