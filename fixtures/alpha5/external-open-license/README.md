# Beta 1 curated open-license camera photographs

This cohort contains audited third-party camera photographs from Wikimedia Commons and a commit-pinned ZXing Android-camera black-box set. It is the Beta 1 photo gate and remains deliberately separate from `fixtures/alpha5/project-photos/`.

Curated open-license camera photographs satisfy the Beta 1 photo gate but do not constitute physical-camera/device evidence or project ownership.

Accepted assets preserve downloaded original bytes without recompression. Each manifest entry records the original URL, dimensions and byte length, trusted source, author, redistribution license and evidence, attribution, retrieval time, SHA-256, camera-photo review, rights review, sensitive-data review, expected format, and independent Ground Truth. The source page, original URL, original-byte SHA-256, and expected result multiset are duplicated in `ground-truth-registry.json`, a decoder-independent audited allowlist that the generator and verifier compare with the manifest before any Scanly decode runs. ZXing assets additionally pin the exact source revision, repository-wide `.reuse/dep5` coverage, the upstream `.txt` answer URL/payload/SHA-256, and the historical commit that identifies the set as real-world Android-device photographs. `derived/` remains reserved for separately recorded transformations and never replaces an original.

PDF417 boarding passes, identity documents, tickets, labels, or other images are rejected from the public repository when Scanly decodes personal or sensitive information. Unknown payloads remain unknown; they are never guessed.

The gate requires at least 12 photos, at least three primary photos per Data Matrix, PDF417, Code 128, and EAN/UPC family, at least 80% overall semantic recall, at least two-thirds recall per family, zero unexpected results, zero format/GS1 errors, and complete provenance/license/camera/safety review. The current corpus passes with 16 photographs (3/3/4/6 by family), 21 visible physical instances, and 20/20 exact deduplicated semantic results. Project-owned count remains 0 and informational. Physical-device evidence remains `unavailable`, so Beta 1 release stays `NO_GO`.

Each accepted entry also includes the internal fixture fields (`id`, `file`, `format`, `formatClass`, `expectedOutcome`, `expectedResultCount`, `requiredResults`, `physicalInstanceCount`, `physicalInstances`, `semanticResultPolicy`, `orientation`, `difficultyTags`, and `sha256`) needed by the decoder and integrity checks. The required provenance and Ground Truth portion is:

```json
{
  "sourceType": "external-open-license",
  "sourceRepository": "Wikimedia Commons | ZXing GitHub",
  "sourcePage": "pinned source page",
  "originalUrl": "pinned original URL",
  "originalFilename": "...",
  "originalWidth": 1600,
  "originalHeight": 1200,
  "originalByteLength": 123456,
  "assetKind": "camera-photograph",
  "author": "...",
  "license": "...",
  "licenseUrl": "...",
  "rightsReviewStatus": "verified",
  "sensitiveDataReviewStatus": "passed",
  "attribution": "...",
  "retrievedAt": "ISO-8601 timestamp",
  "modifications": [],
  "expectedFormat": "data_matrix | pdf417 | code_128 | ean_13 | ean_8 | upc_a | upc_e",
  "expectedPayload": "independently verified payload",
  "requiredResults": [
    { "format": "code_128", "payload": "independently verified payload", "isGs1": false }
  ],
  "groundTruthReview": {
    "method": "maintainer-source-image-review-with-independent-cross-check",
    "reviewer": "Scanly evidence maintainer",
    "reviewedAt": "ISO-8601 timestamp",
    "evidenceUrl": "the exact reviewed original or pinned upstream answer URL",
    "evidenceSha256": "lowercase SHA-256",
    "independentCrossCheck": {
      "tool": "libdmtx | pyzbar",
      "version": "0.1.10 | 0.1.9",
      "outcome": "all-required-results-corroborated | partial-corroboration | no-decode-result",
      "humanReadableLabelReview": "performed-where-present",
      "coverageClaim": "corroborative-only-not-100-percent-decode"
    }
  },
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

Run `npm run fixtures:verify-external -- --gate --output=benchmark-results/development/external-open-license-validation.json` before regenerating the merged fixture manifest. The verifier checks metadata, original bytes/dimensions/SHA-256, normalized family placement, duplicate assets, source-specific license constraints, visible-instance multiplicity, family coverage, recall, and multiplicity-sensitive `(format, payload, isGs1)` Ground Truth against all-format multi-result Scanly decoding. Wikimedia reviews record libdmtx 0.1.10 for Data Matrix or pyzbar 0.1.9 for 1D corroboration plus human-readable-label review where present; partial or absent independent-tool decodes are recorded honestly and are never described as 100% coverage. Human camera/rights/sensitive-data decisions must be recorded before admission; wrong or extra results always fail, while misses remain visible in recall.
