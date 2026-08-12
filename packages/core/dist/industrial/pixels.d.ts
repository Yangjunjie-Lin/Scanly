import { type NormalizedFrame } from "../contracts/frame.js";
import type { RecoveryBufferKind } from "./memory.js";
import type { RecoveryCandidate, RecoveryCoordinateTransform, RecoveryRouteId } from "./types.js";
import type { RecoveryMemoryAccountant } from "./memory.js";
export declare function originalRecoveryCandidate(frame: NormalizedFrame): RecoveryCandidate;
export declare function createRecoveryCandidate(source: NormalizedFrame, routeId: RecoveryRouteId, data: Uint8ClampedArray, width: number, height: number, transform: RecoveryCoordinateTransform, memory: RecoveryMemoryAccountant, kind: RecoveryBufferKind, diagnostics: string[]): RecoveryCandidate;
export declare function asRgba(frame: NormalizedFrame): Uint8ClampedArray;
export declare function grayscale(data: Uint8ClampedArray): Uint8ClampedArray;
/** Bounded local contrast normalization using a fixed 8x8 tile grid. */
export declare function localContrastNormalize(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray;
/** A deterministic, clipped local histogram approximation; not an OpenCV dependency. */
export declare function claheLike(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray;
export declare function adaptiveThreshold(data: Uint8ClampedArray, width: number, height: number, radius?: number, offset?: number): Uint8ClampedArray;
/** Removes smooth tile-scale lighting falloff without a global brightness offset. */
export declare function illuminationNormalize(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray;
export declare function unsharpMask(data: Uint8ClampedArray, width: number, height: number, amount?: number, directional?: "horizontal" | "vertical" | "both"): Uint8ClampedArray;
export declare function glareAlternative(data: Uint8ClampedArray, width: number, height: number): {
    data: Uint8ClampedArray;
    glareRatio: number;
};
export declare function resizeNearest(data: Uint8ClampedArray, width: number, height: number, factor: number): {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    transform: RecoveryCoordinateTransform;
};
export declare function resizeBilinear(data: Uint8ClampedArray, width: number, height: number, factor: number): {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    transform: RecoveryCoordinateTransform;
};
export declare function morphologicalClose(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray;
/** Repairs bounded light pinholes/erosion in dark printed modules. */
export declare function morphologicalOpen(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray;
export declare function morphologicalGradient(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray;
export declare function padNeutral(data: Uint8ClampedArray, width: number, height: number, padding: number): {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    transform: RecoveryCoordinateTransform;
};
export declare function writeSample(target: Uint8ClampedArray, targetIndex: number, source: Uint8ClampedArray, width: number, height: number, sx: number, sy: number): void;
//# sourceMappingURL=pixels.d.ts.map