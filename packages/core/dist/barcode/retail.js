/** Restore the public UPC representation emitted by the physical symbol. */
export function canonicalizeRetailText(format, value) {
    if (format === "upc_a" && validDigits(value, 13) && value.startsWith("0")) {
        const upcA = value.slice(1);
        return isValidRetailChecksum(upcA) ? upcA : value;
    }
    if (format === "upc_e") {
        const upcA = validDigits(value, 13) && value.startsWith("0") ? value.slice(1) : value;
        return compressUpcA(upcA) ?? value;
    }
    return value;
}
function validDigits(value, length) {
    return new RegExp(`^\\d{${length}}$`).test(value);
}
export function isValidRetailChecksum(value) {
    if (!/^\d+$/.test(value) || value.length < 2)
        return false;
    let sum = 0;
    const check = Number(value[value.length - 1]);
    for (let index = value.length - 2, position = 0; index >= 0; index -= 1, position += 1) {
        sum += Number(value[index]) * (position % 2 === 0 ? 3 : 1);
    }
    return (10 - (sum % 10)) % 10 === check;
}
export function normalizeRetailBarcode(format, value) {
    if (format === "ean_13" && validDigits(value, 13)) {
        const valid = isValidRetailChecksum(value);
        return { gtin: value, checkDigitValid: valid, normalizedGtin14: `0${value}` };
    }
    if (format === "ean_8" && validDigits(value, 8)) {
        const valid = isValidRetailChecksum(value);
        return { gtin: value, checkDigitValid: valid, normalizedGtin14: `000000${value}` };
    }
    if (format === "upc_a" && validDigits(value, 12)) {
        const valid = isValidRetailChecksum(value);
        return { gtin: value, checkDigitValid: valid, normalizedGtin14: `00${value}` };
    }
    if (format === "upc_e" && validDigits(value, 8)) {
        const expandedUpcA = expandUpcE(value) ?? undefined;
        const valid = Boolean(expandedUpcA);
        return { gtin: value, checkDigitValid: valid, ...(expandedUpcA ? { normalizedGtin14: `00${expandedUpcA}` } : {}), ...(expandedUpcA ? { expandedUpcA } : {}) };
    }
    return null;
}
/** Expand a valid number-system-0 UPC-E payload without replacing the original text. */
export function expandUpcE(value) {
    if (!validDigits(value, 8))
        return null;
    const numberSystem = value[0];
    if (numberSystem !== "0" && numberSystem !== "1")
        return null;
    const body = value.slice(1, 7);
    const check = value[7];
    const last = body[5];
    let manufacturer;
    let product;
    if ("012".includes(last)) {
        manufacturer = `${body.slice(0, 2)}${last}00`;
        product = `00${body.slice(2, 5)}`;
    }
    else if (last === "3") {
        manufacturer = `${body.slice(0, 3)}00`;
        product = `000${body.slice(3, 5)}`;
    }
    else if (last === "4") {
        manufacturer = `${body.slice(0, 4)}0`;
        product = `0000${body[4]}`;
    }
    else {
        manufacturer = body.slice(0, 5);
        product = `0000${last}`;
    }
    const upc = `${numberSystem}${manufacturer}${product}${check}`;
    return validDigits(upc, 12) && isValidRetailChecksum(upc) ? upc : null;
}
/** Compress UPC-A only when an exact, checksum-valid UPC-E round trip exists. */
export function compressUpcA(value) {
    if (!validDigits(value, 12) || !isValidRetailChecksum(value))
        return null;
    const numberSystem = value[0];
    if (numberSystem !== "0" && numberSystem !== "1")
        return null;
    const manufacturer = value.slice(1, 6);
    const product = value.slice(6, 11);
    const check = value[11];
    const candidates = [
        `${numberSystem}${manufacturer.slice(0, 2)}${product.slice(2)}${manufacturer[2]}${check}`,
        `${numberSystem}${manufacturer.slice(0, 3)}${product.slice(3)}3${check}`,
        `${numberSystem}${manufacturer.slice(0, 4)}${product[4]}4${check}`,
        `${numberSystem}${manufacturer}${product[4]}${check}`,
    ];
    return candidates.find((candidate) => expandUpcE(candidate) === value) ?? null;
}
//# sourceMappingURL=retail.js.map