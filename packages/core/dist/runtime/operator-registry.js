import { SdkException, sdkError } from "../contracts/errors.js";
export class OperatorRegistry {
    operators = new Map();
    register(operator, options = {}) {
        const id = operator.descriptor.id;
        if (!id.trim())
            throw new SdkException(sdkError("invalid_configuration", "Operator id must be non-empty."));
        if (this.operators.has(id) && !options.replace) {
            throw new SdkException(sdkError("invalid_configuration", `Operator '${id}' is already registered.`, { operatorId: id }));
        }
        this.operators.set(id, operator);
    }
    unregister(id) { this.operators.delete(id); }
    get(id) {
        return this.operators.get(id);
    }
    list() { return Object.freeze([...this.operators.values()]); }
}
//# sourceMappingURL=operator-registry.js.map