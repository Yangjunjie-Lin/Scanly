import type { CornerPoint } from "../contracts/result.js";
import type { RecoveryCoordinateTransform } from "./types.js";
export declare function identityRecoveryTransform(): RecoveryCoordinateTransform;
export declare function affineRecoveryTransform(kind: "crop" | "resize" | "padding", toOriginal: (point: CornerPoint) => CornerPoint, fromOriginal: (point: CornerPoint) => CornerPoint): RecoveryCoordinateTransform;
export declare function projectiveRecoveryTransform(candidateToOriginal: readonly number[], originalToCandidate: readonly number[]): RecoveryCoordinateTransform;
export declare function curvedRecoveryTransform(toOriginal: (point: CornerPoint) => CornerPoint, fromOriginal: (point: CornerPoint) => CornerPoint): RecoveryCoordinateTransform;
export declare function composeRecoveryTransforms(inner: RecoveryCoordinateTransform, outer: RecoveryCoordinateTransform): RecoveryCoordinateTransform;
export declare function mapRecoveryGeometry(points: readonly CornerPoint[] | undefined, transform: RecoveryCoordinateTransform): CornerPoint[] | undefined;
//# sourceMappingURL=coordinate-transform.d.ts.map