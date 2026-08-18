import type { PixelBuffer, RotationDegrees } from "./types.js";
import type { ExecutionBudget } from "../runtime/execution-budget.js";
/** Rotate RGBA buffer by 0/90/180/270 degrees clockwise. */
export declare function rotateBuffer(src: PixelBuffer, degrees: RotationDegrees, budget?: ExecutionBudget): PixelBuffer;
//# sourceMappingURL=rotate.d.ts.map