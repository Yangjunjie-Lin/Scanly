import type { ResultValidator } from "../contracts/validator.js";
export declare class ValidatorRegistry {
    private readonly validators;
    register(validator: ResultValidator, options?: {
        replace?: boolean;
    }): void;
    unregister(id: string): void;
    get(id: string): ResultValidator | undefined;
    list(): readonly ResultValidator[];
}
//# sourceMappingURL=validator-registry.d.ts.map