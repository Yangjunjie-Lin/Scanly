import { RecoveryRouteRegistry } from "./recovery-route-registry.js";
const ROUTE_ORDER = [
    "low-contrast", "illumination", "glare", "blur", "perspective", "small-module",
    "damaged", "quiet-zone", "screen", "curved", "dpm", "general",
];
export function recoveryBudgetFor(profile, sourceMode, framePixels) {
    const pixels = Math.max(1, Math.floor(framePixels));
    if (sourceMode === "camera") {
        if (profile === "fast")
            return budget(1, 1, pixels * 2, 32, 2, 1, 16 * 1024 * 1024);
        if (profile === "balanced")
            return budget(2, 3, pixels * 4, 75, 3, 1, 32 * 1024 * 1024);
        if (profile === "robust")
            return budget(4, 6, pixels * 7, 180, 4, 2, 64 * 1024 * 1024);
        if (profile === "dpm-experimental")
            return budget(4, 7, pixels * 8, 220, 4, 2, 64 * 1024 * 1024);
        return budget(5, 8, pixels * 9, 260, 5, 2, 80 * 1024 * 1024);
    }
    if (profile === "fast")
        return budget(1, 2, pixels * 3, 250, 2, 1, 32 * 1024 * 1024);
    if (profile === "balanced")
        return budget(3, 5, pixels * 7, 800, 4, 2, 64 * 1024 * 1024);
    if (profile === "robust")
        return budget(5, 9, pixels * 12, 2_000, 6, 3, 96 * 1024 * 1024);
    if (profile === "dpm-experimental")
        return budget(6, 11, pixels * 15, 3_000, 6, 3, 128 * 1024 * 1024);
    return budget(7, 12, pixels * 16, 3_000, 8, 4, 128 * 1024 * 1024);
}
export class RecoveryPlanner {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    plan(context) {
        validateBudget(context.budget);
        const excluded = new Set(context.excludedRoutes ?? []);
        const ranked = [...new Set(context.diagnosis.recommendedRoutes)].sort((left, right) => {
            const leftIndex = ROUTE_ORDER.indexOf(left);
            const rightIndex = ROUTE_ORDER.indexOf(right);
            return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
        });
        const rejected = [];
        const entries = [];
        let estimatedPixels = 0;
        for (const routeId of ranked) {
            if (entries.length >= context.budget.maximumRoutes) {
                rejected.push({ routeId, reason: "maximum-routes" });
                continue;
            }
            if (excluded.has(routeId)) {
                rejected.push({ routeId, reason: "ablation-excluded" });
                continue;
            }
            if (routeId === "dpm" && !context.dpmExperimentalEnabled) {
                rejected.push({ routeId, reason: "dpm-experimental-disabled" });
                continue;
            }
            const route = this.registry.get(routeId);
            if (!route) {
                rejected.push({ routeId, reason: "route-not-registered" });
                continue;
            }
            if (!route.supports(context)) {
                rejected.push({ routeId, reason: "route-not-supported" });
                continue;
            }
            const estimatedCost = Math.max(0, Math.ceil(route.estimateCost(context)));
            if (estimatedPixels + estimatedCost > context.budget.maximumPixelsProcessed) {
                rejected.push({ routeId, reason: "pixel-budget" });
                continue;
            }
            entries.push({ routeId, estimatedCost, reason: `diagnosis:${routeId}` });
            estimatedPixels += estimatedCost;
        }
        return { entries, budget: { ...context.budget }, rejected };
    }
}
function budget(maximumRoutes, maximumAttempts, maximumPixelsProcessed, maximumTotalMs, maximumCandidates, maximumPerspectiveTransforms, maximumTemporaryBytes) {
    return {
        maximumRoutes, maximumAttempts, maximumPixelsProcessed, maximumTotalMs,
        maximumCandidates, maximumPerspectiveTransforms,
        maximumRectifiedArea: Math.min(maximumPixelsProcessed, 4_000_000), maximumTemporaryBytes,
    };
}
export function validateBudget(value) {
    for (const key of ["maximumRoutes", "maximumAttempts", "maximumPixelsProcessed"]) {
        if (!Number.isSafeInteger(value[key]) || value[key] < 1)
            throw new RangeError(`${key} must be a positive integer.`);
    }
    for (const key of ["maximumCandidates", "maximumRectifiedArea", "maximumPerspectiveTransforms", "maximumTemporaryBytes"]) {
        const entry = value[key];
        if (entry !== undefined && (!Number.isSafeInteger(entry) || entry < 1))
            throw new RangeError(`${key} must be a positive integer when supplied.`);
    }
    if (value.maximumTotalMs !== undefined && (!Number.isFinite(value.maximumTotalMs) || value.maximumTotalMs <= 0))
        throw new RangeError("maximumTotalMs must be positive when supplied.");
}
//# sourceMappingURL=recovery-planner.js.map