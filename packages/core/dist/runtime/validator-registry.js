import { SdkException, sdkError } from "../contracts/errors.js";
export class ValidatorRegistry {
    validators = new Map();
    register(validator, options = {}) {
        if (!validator.id.trim())
            throw new SdkException(sdkError("invalid_configuration", "Validator id must be non-empty."));
        if (this.validators.has(validator.id) && !options.replace) {
            throw new SdkException(sdkError("invalid_configuration", `Validator '${validator.id}' is already registered.`, { validatorId: validator.id }));
        }
        this.validators.set(validator.id, validator);
    }
    unregister(id) { this.validators.delete(id); }
    get(id) { return this.validators.get(id); }
    list() { return Object.freeze([...this.validators.values()]); }
}
//# sourceMappingURL=validator-registry.js.map