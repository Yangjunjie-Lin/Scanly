import type { PixelBuffer } from "@scanly/core/qr";
export interface SerializedPixelBuffer {
    width: number;
    height: number;
    /** Detached ArrayBuffer transferred to worker. */
    buffer: ArrayBuffer;
}
export declare function toTransferable(buffer: PixelBuffer): {
    serialized: SerializedPixelBuffer;
    transfer: Transferable[];
};
export declare function fromTransferable(serialized: SerializedPixelBuffer): PixelBuffer;
//# sourceMappingURL=transferable-buffer.d.ts.map