import type { BarcodeGeometry } from "../scanner/types.js";
export interface Point {
    x: number;
    y: number;
}
export declare function geometryCenter(geometry: BarcodeGeometry): Point;
export declare function geometryArea(geometry: BarcodeGeometry): number;
export declare function geometryIoU(a: BarcodeGeometry, b: BarcodeGeometry): number;
export declare function geometryDistanceScale(a: BarcodeGeometry, b: BarcodeGeometry): number;
export declare function translateGeometry(geometry: BarcodeGeometry, x: number, y: number): BarcodeGeometry;
export declare function cloneGeometry(geometry: BarcodeGeometry): BarcodeGeometry;
export declare function isFiniteGeometry(geometry: BarcodeGeometry): boolean;
//# sourceMappingURL=geometry.d.ts.map