/** Lightweight edge/line detector. Callers must retain a full-frame fallback. */
export class CandidateRegionDetector {
    options;
    constructor(options = {}) {
        this.options = options;
    }
    detect(frame) {
        const grid = clampInt(this.options.gridSize ?? 12, 4, 24);
        const windowCells = clampInt(this.options.windowCells ?? 3, 1, Math.min(6, grid));
        const maximumRegions = clampInt(this.options.maximumRegions ?? 6, 1, 16);
        const cellWidth = Math.max(1, Math.ceil(frame.width / grid));
        const cellHeight = Math.max(1, Math.ceil(frame.height / grid));
        const cells = new Array(grid * grid);
        for (let gy = 0; gy < grid; gy += 1)
            for (let gx = 0; gx < grid; gx += 1) {
                cells[gy * grid + gx] = inspectCell(frame, gx * cellWidth, gy * cellHeight, cellWidth, cellHeight);
            }
        const raw = [];
        for (let gy = 0; gy <= grid - windowCells; gy += 1)
            for (let gx = 0; gx <= grid - windowCells; gx += 1) {
                let edge = 0;
                let horizontal = 0;
                let vertical = 0;
                let contrast = 0;
                for (let wy = 0; wy < windowCells; wy += 1)
                    for (let wx = 0; wx < windowCells; wx += 1) {
                        const cell = cells[(gy + wy) * grid + gx + wx];
                        edge += cell.edge;
                        horizontal += cell.horizontal;
                        vertical += cell.vertical;
                        contrast += cell.contrast;
                    }
                const count = windowCells * windowCells;
                const lineCoherence = Math.abs(horizontal - vertical) / Math.max(1, horizontal + vertical);
                const score = Math.min(1, edge / count * 0.6 + contrast / count * 0.25 + lineCoherence * 0.15);
                if (score < (this.options.minimumScore ?? 0.16))
                    continue;
                const x = gx * cellWidth;
                const y = gy * cellHeight;
                const width = Math.min(frame.width - x, windowCells * cellWidth);
                const height = Math.min(frame.height - y, windowCells * cellHeight);
                raw.push({
                    id: `region-${gx}-${gy}`,
                    boundingBox: { x, y, width, height },
                    score,
                    orientationEstimate: horizontal >= vertical ? 0 : 90,
                    difficultyHints: [
                        ...(contrast / count < 0.2 ? ["low-contrast"] : []),
                        ...(lineCoherence > 0.55 ? ["linear-structure"] : []),
                        ...(Math.min(width, height) < Math.min(frame.width, frame.height) * 0.18 ? ["small-module"] : []),
                    ],
                });
            }
        return nonMaximumSuppression(raw, maximumRegions);
    }
}
function inspectCell(frame, x0, y0, width, height) {
    const step = Math.max(1, Math.floor(Math.min(width, height) / 8));
    let edge = 0;
    let horizontal = 0;
    let vertical = 0;
    let minimum = 255;
    let maximum = 0;
    let count = 0;
    for (let y = y0 + step; y < Math.min(frame.height, y0 + height); y += step)
        for (let x = x0 + step; x < Math.min(frame.width, x0 + width); x += step) {
            const value = luminance(frame, x, y);
            const dx = Math.abs(value - luminance(frame, x - step, y));
            const dy = Math.abs(value - luminance(frame, x, y - step));
            horizontal += dx;
            vertical += dy;
            edge += Math.min(1, (dx + dy) / 96);
            minimum = Math.min(minimum, value);
            maximum = Math.max(maximum, value);
            count += 1;
        }
    return { edge: edge / Math.max(1, count), horizontal, vertical, contrast: (maximum - minimum) / 255 };
}
function nonMaximumSuppression(regions, maximum) {
    const sorted = [...regions].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const kept = [];
    for (const region of sorted) {
        if (kept.length >= maximum)
            break;
        if (!kept.some((existing) => intersectionOverUnion(existing.boundingBox, region.boundingBox) > 0.45))
            kept.push(region);
    }
    return kept;
}
function intersectionOverUnion(a, b) {
    const left = Math.max(a.x, b.x);
    const top = Math.max(a.y, b.y);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const union = a.width * a.height + b.width * b.height - intersection;
    return union <= 0 ? 0 : intersection / union;
}
function luminance(frame, x, y) {
    const row = y * frame.rowStride;
    if (frame.pixelFormat === "gray8" || frame.pixelFormat === "yuv420")
        return frame.data[row + x] ?? 0;
    const channels = frame.pixelFormat === "rgba8888" ? 4 : 3;
    const offset = row + x * channels;
    return (frame.data[offset] ?? 0) * 0.2126 + (frame.data[offset + 1] ?? 0) * 0.7152 + (frame.data[offset + 2] ?? 0) * 0.0722;
}
function clampInt(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, Math.floor(value))); }
//# sourceMappingURL=candidate-region.js.map