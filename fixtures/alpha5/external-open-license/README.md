# Alpha.5 external open-license real-world photographs

This cohort contains third-party real-world barcode photographs from Wikimedia Commons. It is deliberately separate from `fixtures/alpha5/project-photos/`.

External open-license photographs provide third-party real-world validation but do not satisfy the project-owned photograph release gate.

Accepted assets must preserve the downloaded original bytes without recompression. Each accepted manifest entry records its Wikimedia source page, original filename, author, license, license URL, attribution, retrieval time, SHA-256, expected format, payload verification status, and a complete provenance note. `derived/` is reserved for crops, rotations, redactions, or resizes; every derived operation must be recorded and never replace the original.

PDF417 boarding passes, identity documents, tickets, labels, or other images are rejected from the public repository when Scanly decodes personal or sensitive information. Unknown payloads remain unknown; they are never guessed.

The external cohort has blocking CI regression gates for corpus count, exact correctness, false positives, format/GS1 classification, provenance, and public-repository safety. The current corpus passes at 12/12 photographs, 17 recorded visible physical instances, and 16/16 exact deduplicated semantic results. These gates do not change `projectOwnedRealPhotos`, satisfy any project-owned family gate, or close `BLOCKED_REAL_PHOTO_INPUT`.

Each accepted entry also includes the internal fixture fields (`id`, `file`, `format`, `formatClass`, `expectedOutcome`, `expectedResultCount`, `requiredResults`, `physicalInstanceCount`, `physicalInstances`, `semanticResultPolicy`, `orientation`, `difficultyTags`, and `sha256`) needed by the decoder and integrity checks. The required provenance and Ground Truth portion is:

```json
{
  "sourceType": "external-open-license",
  "sourceRepository": "Wikimedia Commons",
  "sourcePage": "https://commons.wikimedia.org/wiki/File:...",
  "originalFilename": "...",
  "author": "...",
  "license": "...",
  "licenseUrl": "...",
  "attribution": "...",
  "retrievedAt": "ISO-8601 timestamp",
  "modifications": [],
  "expectedFormat": "data_matrix | pdf417 | code_128 | ean_13 | ean_8 | upc_a | upc_e",
  "expectedPayload": "independently verified payload",
  "requiredResults": [
    { "format": "code_128", "payload": "independently verified payload", "isGs1": false }
  ],
  "physicalInstanceCount": 1,
  "physicalInstances": [
    { "format": "code_128", "payload": "independently verified payload", "isGs1": false, "count": 1 }
  ],
  "semanticResultPolicy": "unique-format-payload-gs1",
  "payloadVerificationStatus": "verified",
  "publicRepositorySafe": true,
  "visualVerificationStatus": "verified",
  "provenanceNote": "Third-party open-license real-world photograph; not project-owned."
}
```

Run `npm run fixtures:verify-external -- --gate --output=benchmark-results/development/external-open-license-validation.json` before regenerating the merged Alpha.5 fixture manifest. The verifier checks metadata, original SHA-256, normalized family placement, duplicate assets, visible-instance multiplicity, and an exact multiplicity-sensitive `(format, payload, isGs1)` semantic Ground Truth match against all-format multi-result Scanly decoding. Visual and sensitive-data review remain human decisions and must be recorded before a fixture is accepted.
