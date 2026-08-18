import type { RecoveryRoute, RecoveryRouteId } from "./types.js";

export class RecoveryRouteRegistry {
  private readonly routes = new Map<RecoveryRouteId, RecoveryRoute>();

  register(route: RecoveryRoute, options: { replace?: boolean } = {}): void {
    if (!route || typeof route.id !== "string") throw new TypeError("Recovery route must define an id.");
    if (this.routes.has(route.id) && !options.replace) throw new Error(`Recovery route '${route.id}' is already registered.`);
    this.routes.set(route.id, route);
  }

  unregister(id: RecoveryRouteId): void { this.routes.delete(id); }
  get(id: RecoveryRouteId): RecoveryRoute | undefined { return this.routes.get(id); }
  list(): readonly RecoveryRoute[] { return Object.freeze([...this.routes.values()]); }
  get size(): number { return this.routes.size; }
}
