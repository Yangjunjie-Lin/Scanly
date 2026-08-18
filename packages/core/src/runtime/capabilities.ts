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

export function inspectCapabilities(engines: EngineRegistry, operators: OperatorRegistry): ScanlyCapabilities {
  const registered = engines.list();
  return {
    formats: [...new Set(registered.flatMap((engine) => engine.capabilities.formats))].sort(),
    pixelFormats: ["rgba8888", "rgb888", "gray8"],
    scenarioFeatures: {
      roi: true,
      parallelEngines: registered.length > 1,
      spatialDeduplication: true,
      temporalTracking: false,
      heuristicQuality: false,
      yuvNormalization: false,
    },
    engines: registered.map((engine) => ({ id: engine.id, version: engine.version, capabilities: { ...engine.capabilities, formats: [...engine.capabilities.formats] } })),
    operators: operators.list().map((operator) => ({ id: operator.descriptor.id, version: operator.descriptor.version, descriptor: { ...operator.descriptor } })),
  };
}
