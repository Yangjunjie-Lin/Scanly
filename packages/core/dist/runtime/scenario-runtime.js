export function scenarioToPipelineConfig(scenario) {
    const enhancements = scenario.ablation.enhancement
        ? ["original", ...scenario.enhancement.operators]
        : ["original"];
    const decoderOrder = scenario.ablation.multiEngineFallback ? scenario.decoders.order : scenario.decoders.order.slice(0, 1);
    return {
        maxCandidates: Math.min(scenario.localization.maxCandidates, scenario.budgets.maxCandidates),
        maxAttempts: scenario.budgets.maxAttempts,
        timeoutMs: scenario.budgets.maxExecutionMs,
        maxPixels: scenario.budgets.maxPixels,
        findMultiple: scenario.multiCode.enabled,
        maxMultipleResults: scenario.multiCode.maxResults,
        resultDeduplication: scenario.multiCode.deduplication,
        stallCandidateLimit: scenario.multiCode.enabled ? 16 : 1,
        scales: scenario.ablation.multiScale ? scenario.localization.scales : [1],
        paddings: scenario.localization.cropPaddings,
        rotations: scenario.ablation.rotations ? scenario.enhancement.rotations : [0],
        preprocessOrder: enhancements,
        decoders: { order: decoderOrder, execution: scenario.decoders.execution, failurePolicy: scenario.decoders.failurePolicy ?? "success-wins" },
        // Comparison/ablation runners clone scenario IDs, so use the latency
        // budget rather than a mutable label to preserve Fast's cold-start policy.
        fallbackTiming: scenario.budgets.maxAttempts <= 18 ? "final" : "after-cheap",
        enableLocalization: scenario.ablation.localization && scenario.localization.strategy === "edge-density",
        enableFullImageFallback: true,
        enableSplitImageFallback: scenario.ablation.splitImageFallback,
        enableGridImageFallback: scenario.multiCode.enabled && scenario.ablation.splitImageFallback,
        maxIntermediateAllocations: scenario.budgets.maxIntermediateAllocations,
        maxIntermediateBytes: scenario.budgets.maxIntermediateBytes,
    };
}
//# sourceMappingURL=scenario-runtime.js.map