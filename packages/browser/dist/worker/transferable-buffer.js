export function toTransferable(buffer) {
    const backing = buffer.data.buffer;
    const transferable = backing instanceof ArrayBuffer &&
        buffer.data.byteOffset === 0 &&
        buffer.data.byteLength === backing.byteLength
        ? backing
        : buffer.data.slice().buffer;
    return {
        serialized: { width: buffer.width, height: buffer.height, buffer: transferable },
        transfer: [transferable],
    };
}
export function fromTransferable(serialized) {
    return {
        width: serialized.width,
        height: serialized.height,
        data: new Uint8ClampedArray(serialized.buffer),
    };
}
//# sourceMappingURL=transferable-buffer.js.map