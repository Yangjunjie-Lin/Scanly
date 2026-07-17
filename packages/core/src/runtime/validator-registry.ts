import { SdkException, sdkError } from "../contracts/errors.js";
import type { ResultValidator } from "../contracts/validator.js";

export class ValidatorRegistry {
  private readonly validators = new Map<string, ResultValidator>();

  register(validator: ResultValidator, options: { replace?: boolean } = {}): void {
    if (!validator.id.trim()) throw new SdkException(sdkError("invalid_configuration", "Validator id must be non-empty."));
    if (this.validators.has(validator.id) && !options.replace) {
      throw new SdkException(sdkError("invalid_configuration", `Validator '${validator.id}' is already registered.`, { validatorId: validator.id }));
    }
    this.validators.set(validator.id, validator);
  }

  unregister(id: string): void { this.validators.delete(id); }
  get(id: string): ResultValidator | undefined { return this.validators.get(id); }
  list(): readonly ResultValidator[] { return Object.freeze([...this.validators.values()]); }
}
