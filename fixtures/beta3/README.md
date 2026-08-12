# Beta 3 industrial difficult corpus

The three evidence layers are intentionally separate:

- `generated/` declares deterministic transforms derived from project-generated barcode fixtures.
- `curated-open-license/` accepts only pinned real photographs with source URL, original URL, license, SHA-256, rights review, and Ground Truth. It is currently empty rather than mislabelled.
- `adversarial-negative/` declares 120 deterministic industrial-looking non-code surfaces. Their only valid confirmed-result count is zero.

Generated and curated evidence are development/integration evidence. Neither is project-owned physical-device evidence. Physical device work remains a separate RC gate tracked by Issue #13.
