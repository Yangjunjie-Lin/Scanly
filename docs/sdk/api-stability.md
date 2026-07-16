# Alpha public API stability

Alpha.3 keeps CaptureRouter as the authoritative scan API and retains documented compatibility wrappers with `@deprecated` annotations. Public declarations and export maps for core, browser, node, react, scenario schema, and engine packages are hashed in `api-snapshots/public-api.json`.

CI rebuilds declarations and fails on an unexpected snapshot change. Intentional Alpha changes require declaration review, migration notes, and `npm run api:update`. Native ESM import and installed-tarball checks remain separate gates.

Internal attempt plans, coordinate matrices, benchmark fixture results, and camera `InternalTrack` state are not promoted to application contracts. Registries remain Alpha extension APIs with explicit register/replace/dispose lifecycle rules.
