/** RFC4180-style CSV field escaping. */
export function escapeCsvField(value) {
    if (value === null || value === undefined)
        return "";
    const s = String(value);
    if (/[",\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}
export function toCsvRow(fields) {
    return fields.map(escapeCsvField).join(",");
}
//# sourceMappingURL=csv.js.map