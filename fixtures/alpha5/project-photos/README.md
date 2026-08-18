# Optional project-owned real photographs

This directory is reserved for authentic project-owned barcode photographs that may supplement the formal curated open-license Beta 1 photo gate. It is currently empty and is not a release-photo requirement.

## Policy

- Do not fabricate photographs.
- Do not label generated images, screenshots, browser-rendered assets, or re-encoded generated fixtures as real photographs.
- Do not place Internet images here; audited third-party assets belong only in `external-open-license/`.
- Accept only images already owned by the project, captured by the repository owner, or explicitly provided with permission.

## Optional balanced corpus

| Family | Minimum | Suggested filenames |
| --- | ---: | --- |
| Data Matrix | 3 | `data-matrix-01.jpg` … `data-matrix-03.jpg` |
| PDF417 | 3 | `pdf417-01.jpg` … `pdf417-03.jpg` |
| Code 128 / GS1-128 | 3 | `code-128-01.jpg` … `code-128-03.jpg` |
| EAN / UPC | 3 | `retail-01.jpg` … `retail-03.jpg` |

## Capture checklist

For each photograph record all of the following in `manifest.json`:

1. `id`, `file`, `format`, `formatClass`
2. `sourceType = project-photo`
3. `expectedPayload` and `expectedRawBytes` when available
4. `expectedOutcome`, `expectedResultCount`, `requiredResults`
5. `orientation`
6. `difficultyTags` (diversify: rotation, perspective, low_contrast, glare, small, blur, dense_background, document_photo, product_packaging)
7. `captureDevice`, `captureResolution`, `captureLighting`
8. `captureDistance` or framing note
9. `license = project-owned`
10. `provenanceNote`

Do not make all 12 photographs trivial centered close-ups.

## Integration

1. Place image files in this directory.
2. Author `fixtures/alpha5/project-photos/manifest.json` with the metadata above.
3. Run `npm run fixtures:generate` so generated fixtures merge with project photos into `fixtures/alpha5/manifest.json`.
4. Run `npm run benchmark:symbologies -- --gate --gate-mode=integration` and confirm all required generated and curated-photo gates remain green.

An empty project-owned manifest is reported as `0 (informational-only)`. It does not weaken the curated open-license photo gate, and it must never be populated by relabelling third-party assets.
