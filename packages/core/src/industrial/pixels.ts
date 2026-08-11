import { createRgbaFrame, type NormalizedFrame } from "../contracts/frame.js";
import { affineRecoveryTransform, identityRecoveryTransform } from "./coordinate-transform.js";
import type { RecoveryBufferKind } from "./memory.js";
import type { RecoveryCandidate, RecoveryCoordinateTransform, RecoveryRouteId } from "./types.js";
import type { RecoveryMemoryAccountant } from "./memory.js";

let candidateSequence = 0;

export function originalRecoveryCandidate(frame: NormalizedFrame): RecoveryCandidate {
  return {
    id: `recovery-general-${++candidateSequence}`,
    routeId: "general",
    frame,
    transform: identityRecoveryTransform(),
    pixelsProcessed: frame.width * frame.height,
    diagnostics: ["full-frame-fallback"],
    dispose: () => undefined,
  };
}

export function createRecoveryCandidate(
  source: NormalizedFrame,
  routeId: RecoveryRouteId,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  transform: RecoveryCoordinateTransform,
  memory: RecoveryMemoryAccountant,
  kind: RecoveryBufferKind,
  diagnostics: string[],
): RecoveryCandidate {
  const lease = memory.reserve(data.byteLength, kind);
  const frame = createRgbaFrame(data, width, height, {
    id: `${source.id}:recovery:${routeId}:${++candidateSequence}`,
    timestampMs: source.timestampMs,
    sourceType: source.sourceType,
    ownership: "owned",
  });
  return {
    id: frame.id,
    routeId,
    frame,
    transform,
    pixelsProcessed: width * height,
    diagnostics,
    dispose: () => { lease.release(); },
  };
}

export function asRgba(frame: NormalizedFrame): Uint8ClampedArray {
  if (frame.pixelFormat === "rgba8888" && frame.rowStride === frame.width * 4) return new Uint8ClampedArray(frame.data);
  const output = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let y = 0; y < frame.height; y += 1) for (let x = 0; x < frame.width; x += 1) {
    const destination = (y * frame.width + x) * 4;
    if (frame.pixelFormat === "gray8" || frame.pixelFormat === "yuv420") {
      const value = frame.data[y * frame.rowStride + x] ?? 0;
      output[destination] = value; output[destination + 1] = value; output[destination + 2] = value; output[destination + 3] = 255;
    } else {
      const channels = frame.pixelFormat === "rgb888" ? 3 : 4;
      const source = y * frame.rowStride + x * channels;
      output[destination] = frame.data[source] ?? 0;
      output[destination + 1] = frame.data[source + 1] ?? 0;
      output[destination + 2] = frame.data[source + 2] ?? 0;
      output[destination + 3] = 255;
    }
  }
  return output;
}

export function grayscale(data: Uint8ClampedArray): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);
  for (let index = 0; index < data.length; index += 4) {
    const value = Math.round(data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722);
    output[index] = value; output[index + 1] = value; output[index + 2] = value; output[index + 3] = 255;
  }
  return output;
}

/** Bounded local contrast normalization using a fixed 8x8 tile grid. */
export function localContrastNormalize(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const gray = grayscale(data); const tilesX = Math.min(8, Math.max(1, width)); const tilesY = Math.min(8, Math.max(1, height));
  const minimums = new Uint8Array(tilesX * tilesY); const maximums = new Uint8Array(tilesX * tilesY); minimums.fill(255);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const tileX = Math.min(tilesX - 1, Math.floor(x * tilesX / width)); const tileY = Math.min(tilesY - 1, Math.floor(y * tilesY / height));
    const tile = tileY * tilesX + tileX; const value = gray[(y * width + x) * 4];
    minimums[tile] = Math.min(minimums[tile], value); maximums[tile] = Math.max(maximums[tile], value);
  }
  const output = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const tileX = Math.min(tilesX - 1, Math.floor(x * tilesX / width)); const tileY = Math.min(tilesY - 1, Math.floor(y * tilesY / height));
    const tile = tileY * tilesX + tileX; const low = minimums[tile]; const high = maximums[tile];
    const value = gray[(y * width + x) * 4]; const normalized = high - low < 8 ? value : clampByte((value - low) * 255 / (high - low));
    const index = (y * width + x) * 4; output[index] = normalized; output[index + 1] = normalized; output[index + 2] = normalized; output[index + 3] = 255;
  }
  return output;
}

/** A deterministic, clipped local histogram approximation; not an OpenCV dependency. */
export function claheLike(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const normalized = localContrastNormalize(data, width, height); const histogram = new Uint32Array(256);
  for (let index = 0; index < normalized.length; index += 4) histogram[normalized[index]] += 1;
  const cap = Math.max(1, Math.floor(width * height / 128)); let excess = 0;
  for (let index = 0; index < histogram.length; index += 1) if (histogram[index] > cap) { excess += histogram[index] - cap; histogram[index] = cap; }
  const spread = Math.floor(excess / 256);
  for (let index = 0; index < histogram.length; index += 1) histogram[index] += spread;
  const map = new Uint8Array(256); let cumulative = 0; const total = Math.max(1, histogram.reduce((sum, value) => sum + value, 0));
  for (let index = 0; index < 256; index += 1) { cumulative += histogram[index]; map[index] = clampByte(cumulative * 255 / total); }
  for (let index = 0; index < normalized.length; index += 4) normalized[index] = normalized[index + 1] = normalized[index + 2] = map[normalized[index]];
  return normalized;
}

export function adaptiveThreshold(data: Uint8ClampedArray, width: number, height: number, radius = 8, offset = 7): Uint8ClampedArray {
  const gray = grayscale(data); const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) { let rowSum = 0; for (let x = 1; x <= width; x += 1) { rowSum += gray[((y - 1) * width + x - 1) * 4]; integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum; } }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const x0 = Math.max(0, x - radius); const y0 = Math.max(0, y - radius); const x1 = Math.min(width - 1, x + radius); const y1 = Math.min(height - 1, y + radius);
    const sum = integral[(y1 + 1) * (width + 1) + x1 + 1] - integral[y0 * (width + 1) + x1 + 1] - integral[(y1 + 1) * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
    const average = sum / ((x1 - x0 + 1) * (y1 - y0 + 1)); const index = (y * width + x) * 4; const value = gray[index] > average - offset ? 255 : 0;
    gray[index] = gray[index + 1] = gray[index + 2] = value;
  }
  return gray;
}

/** Removes smooth tile-scale lighting falloff without a global brightness offset. */
export function illuminationNormalize(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const gray = grayscale(data); const grid = 12; const means = new Float64Array(grid * grid); const counts = new Uint32Array(grid * grid);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const gx = Math.min(grid - 1, Math.floor(x * grid / width)); const gy = Math.min(grid - 1, Math.floor(y * grid / height)); const cell = gy * grid + gx; means[cell] += gray[(y * width + x) * 4]; counts[cell] += 1; }
  for (let index = 0; index < means.length; index += 1) means[index] /= Math.max(1, counts[index]);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const gx = Math.min(grid - 1, Math.floor(x * grid / width)); const gy = Math.min(grid - 1, Math.floor(y * grid / height)); const background = means[gy * grid + gx]; const index = (y * width + x) * 4; const value = clampByte(gray[index] - background + 150);
    gray[index] = gray[index + 1] = gray[index + 2] = value;
  }
  return gray;
}

export function unsharpMask(data: Uint8ClampedArray, width: number, height: number, amount = 1.15, directional: "horizontal" | "vertical" | "both" = "both"): Uint8ClampedArray {
  const gray = grayscale(data); const output = new Uint8ClampedArray(gray);
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = (y * width + x) * 4; const center = gray[index];
    const neighbours = directional === "horizontal" ? [gray[index - 4], gray[index + 4]] : directional === "vertical" ? [gray[index - width * 4], gray[index + width * 4]] : [gray[index - 4], gray[index + 4], gray[index - width * 4], gray[index + width * 4]];
    const blurred = neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length; const value = clampByte(center + (center - blurred) * amount);
    output[index] = output[index + 1] = output[index + 2] = value;
  }
  return output;
}

export function glareAlternative(data: Uint8ClampedArray, width: number, height: number): { data: Uint8ClampedArray; glareRatio: number } {
  const gray = grayscale(data); let clipped = 0;
  for (let index = 0; index < gray.length; index += 4) {
    if (gray[index] >= 248) { clipped += 1; gray[index] = gray[index + 1] = gray[index + 2] = 255; }
  }
  return { data: adaptiveThreshold(gray, width, height, 10, 3), glareRatio: clipped / Math.max(1, gray.length / 4) };
}

export function resizeNearest(data: Uint8ClampedArray, width: number, height: number, factor: number): { data: Uint8ClampedArray; width: number; height: number; transform: RecoveryCoordinateTransform } {
  const nextWidth = Math.max(1, Math.round(width * factor)); const nextHeight = Math.max(1, Math.round(height * factor)); const output = new Uint8ClampedArray(nextWidth * nextHeight * 4);
  for (let y = 0; y < nextHeight; y += 1) for (let x = 0; x < nextWidth; x += 1) {
    const sourceX = Math.min(width - 1, Math.floor(x / factor)); const sourceY = Math.min(height - 1, Math.floor(y / factor)); const from = (sourceY * width + sourceX) * 4; const to = (y * nextWidth + x) * 4;
    output[to] = data[from]; output[to + 1] = data[from + 1]; output[to + 2] = data[from + 2]; output[to + 3] = 255;
  }
  return { data: output, width: nextWidth, height: nextHeight, transform: affineRecoveryTransform("resize", (point) => ({ x: point.x / factor, y: point.y / factor }), (point) => ({ x: point.x * factor, y: point.y * factor })) };
}

export function resizeBilinear(data: Uint8ClampedArray, width: number, height: number, factor: number): { data: Uint8ClampedArray; width: number; height: number; transform: RecoveryCoordinateTransform } {
  const nextWidth = Math.max(1, Math.round(width * factor)); const nextHeight = Math.max(1, Math.round(height * factor)); const output = new Uint8ClampedArray(nextWidth * nextHeight * 4);
  for (let y = 0; y < nextHeight; y += 1) for (let x = 0; x < nextWidth; x += 1) {
    const sx = Math.max(0, Math.min(width - 1, (x + 0.5) / factor - 0.5)); const sy = Math.max(0, Math.min(height - 1, (y + 0.5) / factor - 0.5));
    writeSample(output, (y * nextWidth + x) * 4, data, width, height, sx, sy);
  }
  return { data: output, width: nextWidth, height: nextHeight, transform: affineRecoveryTransform("resize", (point) => ({ x: (point.x + 0.5) / factor - 0.5, y: (point.y + 0.5) / factor - 0.5 }), (point) => ({ x: (point.x + 0.5) * factor - 0.5, y: (point.y + 0.5) * factor - 0.5 })) };
}

export function morphologicalClose(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray { return erode(dilate(grayscale(data), width, height), width, height); }
/** Repairs bounded light pinholes/erosion in dark printed modules. */
export function morphologicalOpen(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray { return dilate(erode(grayscale(data), width, height), width, height); }
export function morphologicalGradient(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const source = grayscale(data); const high = dilate(source, width, height); const low = erode(source, width, height); const output = new Uint8ClampedArray(source.length);
  for (let index = 0; index < output.length; index += 4) { const value = high[index] - low[index]; output[index] = output[index + 1] = output[index + 2] = value; output[index + 3] = 255; }
  return output;
}

export function padNeutral(data: Uint8ClampedArray, width: number, height: number, padding: number): { data: Uint8ClampedArray; width: number; height: number; transform: RecoveryCoordinateTransform } {
  const nextWidth = width + padding * 2; const nextHeight = height + padding * 2; const output = new Uint8ClampedArray(nextWidth * nextHeight * 4); output.fill(255);
  for (let y = 0; y < height; y += 1) output.set(data.subarray(y * width * 4, (y + 1) * width * 4), ((y + padding) * nextWidth + padding) * 4);
  return { data: output, width: nextWidth, height: nextHeight, transform: affineRecoveryTransform("padding", (point) => ({ x: point.x - padding, y: point.y - padding }), (point) => ({ x: point.x + padding, y: point.y + padding })) };
}

function dilate(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray { return morphology(data, width, height, Math.max); }
function erode(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray { return morphology(data, width, height, Math.min); }
function morphology(data: Uint8ClampedArray, width: number, height: number, reducer: (...values: number[]) => number): Uint8ClampedArray {
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const values: number[] = []; for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) { const sx = Math.max(0, Math.min(width - 1, x + dx)); const sy = Math.max(0, Math.min(height - 1, y + dy)); values.push(data[(sy * width + sx) * 4]); }
    const index = (y * width + x) * 4; const value = reducer(...values); output[index] = output[index + 1] = output[index + 2] = value; output[index + 3] = 255;
  }
  return output;
}

export function writeSample(target: Uint8ClampedArray, targetIndex: number, source: Uint8ClampedArray, width: number, height: number, sx: number, sy: number): void {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx))); const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy))); const x1 = Math.min(width - 1, x0 + 1); const y1 = Math.min(height - 1, y0 + 1); const dx = sx - x0; const dy = sy - y0;
  for (let channel = 0; channel < 3; channel += 1) { const top = source[(y0 * width + x0) * 4 + channel] * (1 - dx) + source[(y0 * width + x1) * 4 + channel] * dx; const bottom = source[(y1 * width + x0) * 4 + channel] * (1 - dx) + source[(y1 * width + x1) * 4 + channel] * dx; target[targetIndex + channel] = clampByte(top * (1 - dy) + bottom * dy); }
  target[targetIndex + 3] = 255;
}
function clampByte(value: number): number { return Math.max(0, Math.min(255, Math.round(value))); }
