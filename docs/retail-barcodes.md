# Retail Barcodes

EAN/UPC results are format-preserving. Scanly validates the payload length and modulo-10 check digit before accepting a result:

- EAN-13: 13 digits, returned as `ean_13`.
- EAN-8: 8 digits, returned as `ean_8`.
- UPC-A: 12 digits, returned as `upc_a`; it is not silently converted to EAN-13.
- UPC-E: original 8-digit payload returned as `upc_e`; an expanded UPC-A is optional metadata.

`metadata.retail` can include `gtin`, `checkDigitValid`, `normalizedGtin14`, and `expandedUpcA`. Invalid checksums are rejected even if a native engine emitted the text. This policy is intentionally stricter than displaying an unverified engine string.

