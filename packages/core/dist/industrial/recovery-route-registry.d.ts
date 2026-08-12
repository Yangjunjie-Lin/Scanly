import type { RecoveryRoute, RecoveryRouteId } from "./types.js";
export declare class RecoveryRouteRegistry {
    private readonly routes;
    register(route: RecoveryRoute, options?: {
        replace?: boolean;
    }): void;
    unregister(id: RecoveryRouteId): void;
    get(id: RecoveryRouteId): RecoveryRoute | undefined;
    list(): readonly RecoveryRoute[];
    get size(): number;
}
//# sourceMappingURL=recovery-route-registry.d.ts.map