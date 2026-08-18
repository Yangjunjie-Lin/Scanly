export type StructuredPayloadKind = "url" | "wifi" | "vcard" | "email" | "telephone" | "sms" | "geo" | "calendar" | "gs1-element-string" | "gs1-digital-link";
export interface StructuredPayload {
    kind: StructuredPayloadKind;
    parserVersion: "1.0";
    fields: Readonly<Record<string, string | string[] | number | boolean | null>>;
    warnings: string[];
}
export interface SemanticParseResult {
    rawText: string;
    structured: StructuredPayload | null;
}
export declare function parseSemanticPayload(rawText: string): SemanticParseResult;
export declare function isSafeActionUrl(text: string): boolean;
//# sourceMappingURL=index.d.ts.map