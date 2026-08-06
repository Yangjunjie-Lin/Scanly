export type StructuredPayloadKind =
  | "url"
  | "wifi"
  | "vcard"
  | "email"
  | "telephone"
  | "sms"
  | "geo"
  | "calendar"
  | "gs1-element-string"
  | "gs1-digital-link";

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

const PARSER_VERSION = "1.0" as const;

function unescapeBackslash(value: string): string {
  return value.replace(/\\([\\;,nN:])/g, (_match, char: string) => char.toLowerCase() === "n" ? "\n" : char);
}

function splitEscaped(value: string, separator = ";"): string[] {
  const output: string[] = [];
  let current = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      current += `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === separator) {
      output.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  output.push(current);
  return output;
}

function parseUrl(text: string): StructuredPayload | null {
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const fields: StructuredPayload["fields"] = {
      href: url.href,
      protocol: url.protocol,
      host: url.host,
      pathname: url.pathname,
    };
    if (url.hostname === "id.gs1.org" || url.hostname.endsWith(".id.gs1.org")) {
      return { kind: "gs1-digital-link", parserVersion: PARSER_VERSION, fields, warnings: [] };
    }
    return { kind: "url", parserVersion: PARSER_VERSION, fields, warnings: [] };
  } catch {
    return null;
  }
}

function parseWifi(text: string): StructuredPayload | null {
  if (!text.startsWith("WIFI:") || !text.endsWith(";;")) return null;
  const entries = splitEscaped(text.slice(5, -2));
  const fields: Record<string, string | boolean> = {};
  const keyNames: Record<string, string> = { T: "authentication", S: "ssid", P: "password", H: "hidden", I: "identity", A: "anonymousIdentity", E: "eapMethod", PH2: "phase2Method" };
  for (const entry of entries) {
    const index = entry.indexOf(":");
    if (index <= 0) continue;
    const key = keyNames[entry.slice(0, index)];
    if (!key) continue;
    const parsed = unescapeBackslash(entry.slice(index + 1));
    fields[key] = key === "hidden" ? /^true$/i.test(parsed) : parsed;
  }
  if (typeof fields.ssid !== "string") return null;
  return { kind: "wifi", parserVersion: PARSER_VERSION, fields, warnings: [] };
}

function parseVcard(text: string): StructuredPayload | null {
  if (!/^BEGIN:VCARD\r?\n/i.test(text) || !/\r?\nEND:VCARD\s*$/i.test(text)) return null;
  const fields: Record<string, string | string[]> = {};
  for (const line of text.replace(/\r\n[ \t]/g, "").split(/\r?\n/).slice(1, -1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).split(";", 1)[0].toLowerCase();
    const value = unescapeBackslash(line.slice(separator + 1));
    const existing = fields[name];
    fields[name] = existing === undefined ? value : Array.isArray(existing) ? [...existing, value] : [existing, value];
  }
  return { kind: "vcard", parserVersion: PARSER_VERSION, fields, warnings: [] };
}

function parseEmail(text: string): StructuredPayload | null {
  if (!/^mailto:/i.test(text)) return null;
  try {
    const url = new URL(text);
    return {
      kind: "email",
      parserVersion: PARSER_VERSION,
      fields: {
        address: decodeURIComponent(url.pathname),
        subject: url.searchParams.get("subject"),
        body: url.searchParams.get("body"),
        cc: url.searchParams.getAll("cc"),
      },
      warnings: [],
    };
  } catch {
    return null;
  }
}

function parseTelephone(text: string): StructuredPayload | null {
  if (!/^tel:/i.test(text)) return null;
  const number = text.slice(4).trim();
  if (!number) return null;
  return { kind: "telephone", parserVersion: PARSER_VERSION, fields: { number }, warnings: [] };
}

function parseSms(text: string): StructuredPayload | null {
  if (!/^(sms|smsto):/i.test(text)) return null;
  const bodyStart = text.indexOf(":");
  const rest = text.slice(bodyStart + 1);
  const queryIndex = rest.indexOf("?");
  const colonIndex = rest.indexOf(":");
  const addressEnd = queryIndex >= 0 ? queryIndex : colonIndex >= 0 ? colonIndex : rest.length;
  const address = rest.slice(0, addressEnd);
  const body = queryIndex >= 0
    ? new URLSearchParams(rest.slice(queryIndex + 1)).get("body")
    : colonIndex >= 0 ? rest.slice(colonIndex + 1) : null;
  if (!address) return null;
  return { kind: "sms", parserVersion: PARSER_VERSION, fields: { address, body }, warnings: [] };
}

function parseGeo(text: string): StructuredPayload | null {
  const match = /^geo:([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)(?:,([-+]?\d+(?:\.\d+)?))?(?:\?(.*))?$/i.exec(text);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { kind: "geo", parserVersion: PARSER_VERSION, fields: { latitude, longitude, altitude: match[3] ? Number(match[3]) : null, query: match[4] ? decodeURIComponent(match[4]) : null }, warnings: [] };
}

function parseCalendar(text: string): StructuredPayload | null {
  if (!/^BEGIN:VEVENT\r?\n/i.test(text) || !/\r?\nEND:VEVENT\s*$/i.test(text)) return null;
  const fields: Record<string, string | string[]> = {};
  for (const line of text.split(/\r?\n/).slice(1, -1)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).split(";", 1)[0].toLowerCase();
    fields[name] = unescapeBackslash(line.slice(separator + 1));
  }
  return { kind: "calendar", parserVersion: PARSER_VERSION, fields, warnings: [] };
}

function parseGs1(text: string): StructuredPayload | null {
  const normalized = text.startsWith("]") && text.length > 3 ? text.slice(3) : text;
  const fields: Record<string, string> = {};
  if (/^\(\d{2,4}\)/.test(normalized)) {
    const matches = [...normalized.matchAll(/\((\d{2,4})\)([^()]*)/g)];
    if (!matches.length || !/^(?:\(\d{2,4}\)[^()]*)+$/.test(normalized)) return null;
    if (matches.length > 32) return null;
    for (const match of matches) fields[match[1]] = match[2];
    return { kind: "gs1-element-string", parserVersion: PARSER_VERSION, fields, warnings: [] };
  }
  if (!/^\d{2,4}/.test(normalized)) return null;
  const variableAIs = new Set(["10", "21", "22", "30", "37", "240", "241", "250", "400", "401", "420", "421", "422", "423", "424", "425", "426"]);
  const knownAIs = ["3100", "3101", "3102", "3103", "3104", "3105", "3106", "3107", "3108", "3109", "00", "01", "02", "11", "12", "13", "15", "17", "20", "10", "21", "22", "30", "37", "240", "241", "250", "400", "401", "420", "421", "422", "423", "424", "425", "426"];
  let cursor = 0;
  while (cursor < normalized.length) {
    const ai = knownAIs.find((candidate) => normalized.startsWith(candidate, cursor));
    if (!ai) return null;
    cursor += ai.length;
    const variable = variableAIs.has(ai) || (ai.startsWith("310") && ai.length === 4);
    const fixedLength = ai === "01" ? 14 : ai === "17" || ai === "11" || ai === "13" || ai === "15" ? 6 : ai.startsWith("310") ? 6 : undefined;
    const separator = normalized.indexOf("\u001d", cursor);
    const end = variable ? (separator >= 0 ? separator : normalized.length) : cursor + (fixedLength ?? -1);
    if (end < cursor || end > normalized.length) return null;
    const value = normalized.slice(cursor, end);
    if (!value || (!variable && value.length !== fixedLength)) return null;
    if (Object.keys(fields).length >= 32) return null;
    fields[ai] = value;
    cursor = end + (separator === end ? 1 : 0);
  }
  return Object.keys(fields).length ? { kind: "gs1-element-string", parserVersion: PARSER_VERSION, fields, warnings: [] } : null;
}

export function parseSemanticPayload(rawText: string): SemanticParseResult {
  const parsers = [parseWifi, parseVcard, parseEmail, parseTelephone, parseSms, parseGeo, parseCalendar, parseGs1, parseUrl];
  for (const parser of parsers) {
    const structured = parser(rawText);
    if (structured) return { rawText, structured };
  }
  return { rawText, structured: null };
}

export function isSafeActionUrl(text: string): boolean {
  const parsed = parseUrl(text);
  return parsed?.kind === "url" || parsed?.kind === "gs1-digital-link";
}
