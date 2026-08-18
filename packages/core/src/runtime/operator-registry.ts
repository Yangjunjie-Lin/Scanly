import { SdkException, sdkError } from "../contracts/errors.js";
import type { Operator } from "../contracts/operator.js";

export class OperatorRegistry {
  private readonly operators = new Map<string, Operator<unknown, unknown, unknown>>();

  register<I, O, C>(operator: Operator<I, O, C>, options: { replace?: boolean } = {}): void {
    const id = operator.descriptor.id;
    if (!id.trim()) throw new SdkException(sdkError("invalid_configuration", "Operator id must be non-empty."));
    if (this.operators.has(id) && !options.replace) {
      throw new SdkException(sdkError("invalid_configuration", `Operator '${id}' is already registered.`, { operatorId: id }));
    }
    this.operators.set(id, operator as Operator<unknown, unknown, unknown>);
  }

  unregister(id: string): void { this.operators.delete(id); }
  get<I = unknown, O = unknown, C = unknown>(id: string): Operator<I, O, C> | undefined {
    return this.operators.get(id) as Operator<I, O, C> | undefined;
  }
  list(): readonly Operator<unknown, unknown, unknown>[] { return Object.freeze([...this.operators.values()]); }
}
