import { createCoordinateTransform, IDENTITY_MATRIX } from "../qr/geometry.js";
import { rotateBuffer } from "../qr/rotate.js";
export function sourceToUprightMatrix(orientation, width, height) {
    if (orientation === 90)
        return [0, -1, height - 1, 1, 0, 0, 0, 0, 1];
    if (orientation === 180)
        return [-1, 0, width - 1, 0, -1, height - 1, 0, 0, 1];
    if (orientation === 270)
        return [0, 1, 0, -1, 0, width - 1, 0, 0, 1];
    return IDENTITY_MATRIX;
}
/** Converts source-buffer pixels to canonical upright RGBA coordinates. */
export function normalizeRgbaOrientation(buffer, orientation, budget) {
    const upright = orientation === 0 ? buffer : rotateBuffer(buffer, orientation, budget);
    return {
        buffer: upright,
        sourceOrientation: orientation,
        sourceToUpright: createCoordinateTransform(sourceToUprightMatrix(orientation, buffer.width, buffer.height), buffer.width, buffer.height, upright.width, upright.height),
    };
}
//# sourceMappingURL=frame-normalization.js.map