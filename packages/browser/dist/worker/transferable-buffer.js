export function toTransferableFrame(frame, preserveSource = false) {
    const backing = frame.data.buffer;
    const transferable = !preserveSource && backing instanceof ArrayBuffer && frame.data.byteOffset === 0 && frame.data.byteLength === backing.byteLength
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
export function fromTransferableFrame(frame) {
    return { ...frame, data: new Uint8ClampedArray(frame.buffer), ownership: "transferred" };
}
//# sourceMappingURL=transferable-buffer.js.map