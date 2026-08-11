const EPSILON = 1e-9;
export function geometryCenter(geometry) {
    const box = geometry.boundingBox;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
export function geometryArea(geometry) {
    return Math.max(EPSILON, Math.max(0, geometry.boundingBox.width) * Math.max(0, geometry.boundingBox.height));
}
export function geometryIoU(a, b) {
    const left = Math.max(a.boundingBox.x, b.boundingBox.x);
    const top = Math.max(a.boundingBox.y, b.boundingBox.y);
    const right = Math.min(a.boundingBox.x + Math.max(0, a.boundingBox.width), b.boundingBox.x + Math.max(0, b.boundingBox.width));
    const bottom = Math.min(a.boundingBox.y + Math.max(0, a.boundingBox.height), b.boundingBox.y + Math.max(0, b.boundingBox.height));
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const union = geometryArea(a) + geometryArea(b) - intersection;
    return union <= EPSILON ? 0 : Math.max(0, Math.min(1, intersection / union));
}
export function geometryDistanceScale(a, b) {
    const frameWidth = Math.max(a.frameWidth ?? 0, b.frameWidth ?? 0);
    const frameHeight = Math.max(a.frameHeight ?? 0, b.frameHeight ?? 0);
    if (frameWidth > 0 && frameHeight > 0)
        return Math.max(EPSILON, Math.hypot(frameWidth, frameHeight) * 0.25);
    const largestSymbolDiagonal = Math.max(Math.hypot(a.boundingBox.width, a.boundingBox.height), Math.hypot(b.boundingBox.width, b.boundingBox.height));
    return Math.max(EPSILON, largestSymbolDiagonal * 4);
}
export function translateGeometry(geometry, x, y) {
    return {
        cornerPoints: geometry.cornerPoints.map((point) => ({ x: point.x + x, y: point.y + y })),
        boundingBox: {
            x: geometry.boundingBox.x + x,
            y: geometry.boundingBox.y + y,
            width: geometry.boundingBox.width,
            height: geometry.boundingBox.height,
        },
        ...(geometry.frameWidth !== undefined ? { frameWidth: geometry.frameWidth } : {}),
        ...(geometry.frameHeight !== undefined ? { frameHeight: geometry.frameHeight } : {}),
    };
}
export function cloneGeometry(geometry) {
    return {
        cornerPoints: geometry.cornerPoints.map((point) => ({ ...point })),
        boundingBox: { ...geometry.boundingBox },
        ...(geometry.frameWidth !== undefined ? { frameWidth: geometry.frameWidth } : {}),
        ...(geometry.frameHeight !== undefined ? { frameHeight: geometry.frameHeight } : {}),
    };
}
export function isFiniteGeometry(geometry) {
    const { x, y, width, height } = geometry.boundingBox;
    return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
}
//# sourceMappingURL=geometry.js.map