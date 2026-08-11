export class RecoveryRouteRegistry {
    routes = new Map();
    register(route, options = {}) {
        if (!route || typeof route.id !== "string")
            throw new TypeError("Recovery route must define an id.");
        if (this.routes.has(route.id) && !options.replace)
            throw new Error(`Recovery route '${route.id}' is already registered.`);
        this.routes.set(route.id, route);
    }
    unregister(id) { this.routes.delete(id); }
    get(id) { return this.routes.get(id); }
    list() { return Object.freeze([...this.routes.values()]); }
    get size() { return this.routes.size; }
}
//# sourceMappingURL=recovery-route-registry.js.map