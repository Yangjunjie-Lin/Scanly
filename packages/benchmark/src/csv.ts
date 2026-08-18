/** RFC4180-style CSV field escaping. */
export function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsvRow(fields: Array<string | number | boolean | null | undefined>): string {
  return fields.map(escapeCsvField).join(",");
}
