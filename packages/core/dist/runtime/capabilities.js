export function inspectCapabilities(engines, operators) {
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
//# sourceMappingURL=capabilities.js.map