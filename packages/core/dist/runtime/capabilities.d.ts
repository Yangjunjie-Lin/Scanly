import type { BarcodeFormat } from "@scanly/scenario-schema";
import type { EngineCapabilities } from "../contracts/engine.js";
import type { FramePixelFormat } from "../contracts/frame.js";
import type { OperatorDescriptor } from "../contracts/operator.js";
import type { EngineRegistry } from "./engine-registry.js";
import type { OperatorRegistry } from "./operator-registry.js";
export interface EngineCapabilityReport {
    id: string;
    version: string;
    capabilities: EngineCapabilities;
}
export interface OperatorCapabilityReport {
    id: string;
    version: string;
    descriptor: OperatorDescriptor;
}
export interface ScanlyCapabilities {
    formats: BarcodeFormat[];
    pixelFormats: FramePixelFormat[];
    scenarioFeatures: {
        roi: boolean;
        parallelEngines: boolean;
        spatialDeduplication: boolean;
        temporalTracking: boolean;
        heuristicQuality: boolean;
        yuvNormalization: boolean;
    };
    engines: EngineCapabilityReport[];
    operators: OperatorCapabilityReport[];
}
export declare function inspectCapabilities(engines: EngineRegistry, operators: OperatorRegistry): ScanlyCapabilities;
//# sourceMappingURL=capabilities.d.ts.map