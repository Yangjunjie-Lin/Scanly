# GS1 Handling

GS1 interpretation is an optional semantic step after barcode decoding. A valid raw decode is retained even when semantic parsing returns warnings or no structured payload.

Code 128 FNC1 and Data Matrix FNC1 results are surfaced through `isGs1`, `symbologyIdentifier`, and `metadata.gs1` when the pinned native adapter reports them. The local parser accepts parenthesized element strings and a bounded subset of raw FNC1 element strings, including common GTIN, date, serial, lot, quantity, and location identifiers. It does not claim complete Application Identifier coverage.

Malformed element strings are not converted into a different symbology and do not erase `rawBytes` or the decoded text. PDF417 remains raw unless an explicit document parser is added in a later release.

