# Alpha.5 project-owned real photographs

This directory holds authentic, project-owned barcode photographs required by the Alpha.5 release gates.

## Policy

- Do not fabricate photographs.
- Do not label generated images, screenshots, browser-rendered assets, or re-encoded generated fixtures as real photographs.
- Do not download arbitrary internet images.
- Accept only images already owned by the project, captured by the repository owner, or explicitly provided with permission.

## Required corpus (minimum 12)

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
4. Run `npm run benchmark:symbologies -- --gate` and confirm real-photo gates pass.

Until authentic assets are present, Alpha.5 Evidence Freeze remains blocked with `BLOCKED_REAL_PHOTO_INPUT`.
