import type { NormalizedFrame } from "../contracts/frame.js";
import type {
  BarcodeDifficultyDiagnosis,
  DifficultyLevel,
  RecoveryQualityEvidence,
  RecoveryRouteId,
} from "./types.js";

export interface BarcodeDifficultyAnalyzerOptions {
  sampleTarget?: number;
}

/**
 * Bounded, deterministic routing analysis. The output is heuristic evidence,
 * not a Ground Truth annotation and not a claim that any route will decode.
 */
export class BarcodeDifficultyAnalyzer {
  constructor(private readonly options: BarcodeDifficultyAnalyzerOptions = {}) {}

  analyze(frame: NormalizedFrame, runtime: RecoveryQualityEvidence = {}): BarcodeDifficultyDiagnosis {
    const target = clampInteger(this.options.sampleTarget ?? 2_048, 256, 4_096);
    const step = Math.max(1, Math.floor(Math.sqrt((frame.width * frame.height) / target)));
    const columns = Math.max(1, Math.ceil(frame.width / step));
    const rows = Math.max(1, Math.ceil(frame.height / step));
    const values = new Float64Array(columns * rows);
    let sum = 0;
    let sumSquares = 0;
    let clippedHigh = 0;
    let clippedLow = 0;
    let horizontalGradient = 0;
    let verticalGradient = 0;
    let gradientSquares = 0;
    let transitionCount = 0;
    let isolatedEdges = 0;
    let diagonalGradient = 0;
    let chromaSum = 0;
    let inkCount = 0;
    let inkLeft = columns;
    let inkRight = 0;
    let inkTop = rows;
    let inkBottom = 0;
    const rowInkLeft = new Int32Array(rows); rowInkLeft.fill(columns);
    const rowInkRight = new Int32Array(rows); rowInkRight.fill(-1);

    for (let row = 0; row < rows; row += 1) {
      const y = Math.min(frame.height - 1, row * step);
      for (let column = 0; column < columns; column += 1) {
        const x = Math.min(frame.width - 1, column * step);
        const color = rgb(frame, x, y);
        const value = color.red * 0.2126 + color.green * 0.7152 + color.blue * 0.0722;
        chromaSum += (Math.max(color.red, color.green, color.blue) - Math.min(color.red, color.green, color.blue)) / 255;
        const index = row * columns + column;
        values[index] = value;
        sum += value;
        sumSquares += value * value;
        if (value >= 248) clippedHigh += 1;
        if (value <= 7) clippedLow += 1;
        if (value < 180) { inkCount += 1; inkLeft = Math.min(inkLeft, column); inkRight = Math.max(inkRight, column); inkTop = Math.min(inkTop, row); inkBottom = Math.max(inkBottom, row); rowInkLeft[row] = Math.min(rowInkLeft[row], column); rowInkRight[row] = Math.max(rowInkRight[row], column); }
        if (column > 0) {
          const gradient = Math.abs(value - values[index - 1]);
          horizontalGradient += gradient;
          gradientSquares += gradient * gradient;
          if (gradient >= 34) transitionCount += 1;
          if (gradient >= 70) isolatedEdges += 1;
        }
        if (row > 0) {
          const gradient = Math.abs(value - values[index - columns]);
          verticalGradient += gradient;
          gradientSquares += gradient * gradient;
          if (gradient >= 34) transitionCount += 1;
          if (gradient >= 70) isolatedEdges += 1;
        }
        if (row > 0 && column > 0) diagonalGradient += Math.abs(value - values[index - columns - 1]);
      }
    }

    const count = Math.max(1, values.length);
    const mean = sum / count;
    const standardDeviation = Math.sqrt(Math.max(0, sumSquares / count - mean * mean));
    const adjacencyCount = Math.max(1, rows * Math.max(0, columns - 1) + columns * Math.max(0, rows - 1));
    const gradientMean = (horizontalGradient + verticalGradient) / adjacencyCount;
    const gradientEnergy = Math.sqrt(gradientSquares / adjacencyCount) / 255;
    const transitionRatio = transitionCount / adjacencyCount;
    const anisotropy = Math.abs(horizontalGradient - verticalGradient) / Math.max(1, horizontalGradient + verticalGradient);
    let specularEdges = 0;
    for (let row = 1; row < rows - 1; row += 1) for (let column = 1; column < columns - 1; column += 1) {
      const index = row * columns + column;
      if (values[index] >= 248 && [values[index - 1], values[index + 1], values[index - columns], values[index + columns]].some((value) => value > 30 && value < 225)) specularEdges += 1;
    }
    const glareRatio = runtime.glareRatio ?? Math.min(clippedHigh / count, specularEdges / count * 3);
    const brightness = runtime.brightness ?? mean / 255;
    const globalContrast = Math.min(1, standardDeviation / 96);
    const edgeDensity = runtime.edgeDensity ?? Math.min(1, gradientMean / 64);
    const blurSignal = runtime.blurScore === undefined ? gradientEnergy : runtime.blurScore;
    const local = localDistribution(values, columns, rows);
    const contrast = runtime.contrast ?? Math.min(globalContrast, Math.min(1, local.localDeviation / 128));
    const diagonalSkew = Math.abs(diagonalGradient / Math.max(1, (rows - 1) * (columns - 1)) - gradientMean) / 96;
    const envelope = perspectiveEnvelope(rowInkLeft, rowInkRight, columns);
    const perspectiveScore = Math.min(1, Math.max(local.horizontalImbalance, local.verticalImbalance) * 1.35 + diagonalSkew * 0.8 + envelope.centerRange * 2.5 + envelope.widthVariation * 4);
    const curvatureScore = Math.min(1, Math.abs(local.centerEdgeRatio - 1) * 0.9 + local.columnVariation * 0.4);
    const estimatedPixelsPerModule = transitionRatio <= 0.01 ? 32 : Math.max(0.5, step / transitionRatio / 20);
    const inkAreaRatio = inkCount < 4 ? 1 : ((inkRight - inkLeft + 1) * (inkBottom - inkTop + 1)) / Math.max(1, columns * rows);
    const damageScore = Math.min(1, (isolatedEdges / adjacencyCount) * 0.7 + local.flatBlockRatio * 0.18 + local.blockVariation * 0.12);
    const occlusionScore = Math.min(1, local.flatBlockRatio * Math.min(1, edgeDensity * 2.5));
    const colorFringe = chromaSum / count;
    const screenScore = Math.min(1, colorFringe * 2.8 + Math.max(0, local.periodicity - 0.72) * Math.max(0, transitionRatio - 0.2) * 2);
    const dpmLikelihood = clamp01((1 - contrast) * 0.35 + glareRatio * 0.25 + edgeDensity * 0.25 + damageScore * 0.15);

    const blur = levelFromHighBad(blurSignal, [0.28, 0.16, 0.08]);
    const motionBlur = (runtime.motionEstimate ?? 0) > 0.12 || (transitionRatio > 0.025 && anisotropy > 0.38)
      ? levelFromScore(Math.max(runtime.motionEstimate ?? 0, anisotropy), [0.12, 0.28, 0.48])
      : "none";
    const underexposure = levelFromScore(1 - brightness, [0.78, 0.88, 0.95]);
    const overexposure = levelFromScore(brightness, [0.86, 0.93, 0.975]);
    const glare = levelFromScore(glareRatio, [0.025, 0.1, 0.24]);
    const lowContrast = levelFromScore(1 - contrast, [0.68, 0.82, 0.92]);
    const perspectiveDistortion = levelFromScore(perspectiveScore, [0.16, 0.34, 0.58]);
    const curvature = levelFromScore(curvatureScore, [0.06, 0.16, 0.32]);
    const smallModule = levelFromScore(Math.max(1 / Math.max(0.25, estimatedPixelsPerModule), inkCount >= 4 ? Math.max(0, 0.32 - inkAreaRatio) * 3 : 0), [0.22, 0.38, 0.7]);
    const printingDamage = levelFromScore(damageScore, [0.18, 0.38, 0.62]);
    const occlusion = levelFromScore(occlusionScore, [0.12, 0.3, 0.55]);
    const screenMoiré = levelFromScore(screenScore, [0.18, 0.4, 0.66]);

    const routeScores: Array<[RecoveryRouteId, number]> = [
      ["low-contrast", severity(lowContrast) + severity(underexposure) * 0.35 + severity(overexposure) * 0.2],
      ["illumination", local.illuminationVariation * 8 + severity(underexposure) * 0.2],
      ["glare", severity(glare)],
      ["blur", Math.max(severity(blur), severity(motionBlur))],
      ["perspective", severity(perspectiveDistortion)],
      ["curved", severity(curvature)],
      ["small-module", severity(smallModule)],
      ["damaged", severity(printingDamage) + severity(occlusion) * 0.35],
      ["quiet-zone", local.busyBorderRatio * 3],
      ["screen", severity(screenMoiré)],
      ["dpm", dpmLikelihood * 3],
    ];
    const recommendedRoutes = routeScores
      .filter(([, score]) => score >= 0.75)
      .sort((left, right) => right[1] - left[1])
      .map(([route]) => route);

    return {
      blur, motionBlur, underexposure, overexposure, glare, lowContrast,
      perspectiveDistortion, curvature, smallModule, printingDamage, occlusion,
      screenMoiré, dpmLikelihood, recommendedRoutes,
      evidence: {
        brightness, contrast, glareRatio, edgeDensity, gradientEnergy,
        transitionRatio, anisotropy, perspectiveScore, curvatureScore,
        estimatedPixelsPerModule, inkAreaRatio, damageScore, occlusionScore, screenScore, colorFringe, diagonalSkew,
        perspectiveEnvelopeCenterRange: envelope.centerRange, perspectiveEnvelopeWidthVariation: envelope.widthVariation,
        illuminationVariation: local.illuminationVariation,
        busyBorderRatio: local.busyBorderRatio,
      },
    };
  }
}

function localDistribution(values: Float64Array, columns: number, rows: number) {
  const blockColumns = Math.min(8, columns);
  const blockRows = Math.min(8, rows);
  const means: number[] = [];
  const deviations: number[] = [];
  let flatBlocks = 0;
  let borderBusy = 0;
  let borderBlocks = 0;
  const columnMeans = new Array<number>(columns).fill(0);
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) columnMeans[column] += values[row * columns + column];
    columnMeans[column] /= Math.max(1, rows);
  }
  for (let by = 0; by < blockRows; by += 1) {
    for (let bx = 0; bx < blockColumns; bx += 1) {
      const x0 = Math.floor((bx * columns) / blockColumns);
      const x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * columns) / blockColumns));
      const y0 = Math.floor((by * rows) / blockRows);
      const y1 = Math.max(y0 + 1, Math.floor(((by + 1) * rows) / blockRows));
      let sum = 0; let squares = 0; let count = 0;
      for (let y = y0; y < y1 && y < rows; y += 1) for (let x = x0; x < x1 && x < columns; x += 1) {
        const value = values[y * columns + x]; sum += value; squares += value * value; count += 1;
      }
      const mean = sum / Math.max(1, count);
      const deviation = Math.sqrt(Math.max(0, squares / Math.max(1, count) - mean * mean));
      means.push(mean);
      deviations.push(deviation);
      if (deviation < 5) flatBlocks += 1;
      if (bx === 0 || by === 0 || bx === blockColumns - 1 || by === blockRows - 1) {
        borderBlocks += 1; if (deviation > 28) borderBusy += 1;
      }
    }
  }
  const mean = means.reduce((sum, value) => sum + value, 0) / Math.max(1, means.length);
  const variation = Math.sqrt(means.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, means.length)) / 128;
  const left = average(columnMeans.slice(0, Math.max(1, Math.floor(columns / 3))));
  const center = average(columnMeans.slice(Math.floor(columns / 3), Math.max(Math.floor(columns / 3) + 1, Math.ceil(columns * 2 / 3))));
  const right = average(columnMeans.slice(Math.ceil(columns * 2 / 3)));
  const top = average([...values.slice(0, Math.max(columns, Math.floor(values.length / 3)))]);
  const bottom = average([...values.slice(Math.floor(values.length * 2 / 3))]);
  let alternating = 0;
  for (let index = 2; index < columnMeans.length; index += 1) {
    if ((columnMeans[index] - columnMeans[index - 1]) * (columnMeans[index - 1] - columnMeans[index - 2]) < 0) alternating += 1;
  }
  return {
    horizontalImbalance: Math.abs(left - right) / 255,
    verticalImbalance: Math.abs(top - bottom) / 255,
    centerEdgeRatio: center / Math.max(1, (left + right) / 2),
    columnVariation: standardDeviation(columnMeans) / 128,
    blockVariation: variation,
    localDeviation: Math.max(0, ...deviations),
    illuminationVariation: Math.min(1, Math.max(Math.abs(left - right) / 255, Math.abs(top - bottom) / 255, Math.abs(center / Math.max(1, (left + right) / 2) - 1) * 0.25)),
    flatBlockRatio: flatBlocks / Math.max(1, means.length),
    busyBorderRatio: borderBusy / Math.max(1, borderBlocks),
    periodicity: alternating / Math.max(1, columnMeans.length - 2),
  };
}

function rgb(frame: NormalizedFrame, x: number, y: number): { red: number; green: number; blue: number } {
  const row = y * frame.rowStride;
  if (frame.pixelFormat === "gray8" || frame.pixelFormat === "yuv420") { const value = frame.data[row + x] ?? 0; return { red: value, green: value, blue: value }; }
  const channels = frame.pixelFormat === "rgba8888" ? 4 : 3;
  const offset = row + x * channels;
  return { red: frame.data[offset] ?? 0, green: frame.data[offset + 1] ?? 0, blue: frame.data[offset + 2] ?? 0 };
}

function levelFromScore(score: number, thresholds: readonly [number, number, number]): DifficultyLevel {
  if (score >= thresholds[2]) return "high";
  if (score >= thresholds[1]) return "medium";
  if (score >= thresholds[0]) return "low";
  return "none";
}
function levelFromHighBad(score: number, thresholds: readonly [number, number, number]): DifficultyLevel {
  if (score <= thresholds[2]) return "high";
  if (score <= thresholds[1]) return "medium";
  if (score <= thresholds[0]) return "low";
  return "none";
}
function severity(level: DifficultyLevel): number { return level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0; }
function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function clampInteger(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, Math.floor(value))); }
function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function standardDeviation(values: readonly number[]): number {
  const mean = average(values); return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length));
}
function perspectiveEnvelope(left: Int32Array, right: Int32Array, columns: number): { centerRange: number; widthVariation: number } { const centers: number[] = []; const widths: number[] = []; for (let row = 0; row < left.length; row += 1) if (right[row] >= left[row]) { centers.push((left[row] + right[row]) / 2); widths.push(right[row] - left[row] + 1); } if (centers.length < 3) return { centerRange: 0, widthVariation: 0 }; return { centerRange: (Math.max(...centers) - Math.min(...centers)) / Math.max(1, columns), widthVariation: standardDeviation(widths) / Math.max(1, columns) }; }
