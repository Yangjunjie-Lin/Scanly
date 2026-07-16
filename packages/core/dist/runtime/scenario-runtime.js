export function scenarioToPipelineConfig(scenario) {
    const enhancements = scenario.ablation.enhancement
        ? ["original", ...scenario.enhancement.operators]
        : ["original"];
    const decoderOrder = scenario.ablation.zxingFallback ? scenario.decoders.order : scenario.decoders.order.slice(0, 1);
    return {
        maxCandidates: Math.min(scenario.localization.maxCandidates, scenario.budgets.maxCandidates),
        maxAttempts: scenario.budgets.maxAttempts,
        timeoutMs: scenario.budgets.maxExecutionMs,
        maxPixels: scenario.budgets.maxPixels,
        findMultiple: scenario.multiCode.enabled,
        maxMultipleResults: scenario.multiCode.maxResults,
        stallCandidateLimit: scenario.multiCode.enabled ? 6 : 1,
        scales: scenario.ablation.multiScale ? scenario.localization.scales : [1],
        paddings: scenario.localization.cropPaddings,
        rotations: scenario.ablation.rotations ? scenario.enhancement.rotations : [0],
        preprocessOrder: enhancements,
        decoders: { order: decoderOrder, execution: scenario.decoders.execution },
        enableLocalization: scenario.ablation.localization && scenario.localization.strategy === "edge-density",
        enableFullImageFallback: true,
        enableSplitImageFallback: scenario.ablation.splitImageFallback,
        maxIntermediateAllocations: scenario.budgets.maxIntermediateAllocations,
        maxIntermediateBytes: scenario.budgets.maxIntermediateBytes,
    };
}
//# sourceMappingURL=scenario-runtime.js.map