# RC1 evidence boundary

Files in this directory are release engineering evidence. Product source is
frozen at `identity.sourceCommit` in the final `rc1-candidate-manifest.json`.
Evidence-only commits may add manifests, reports, checksums, SBOM, notices, and
artifact metadata, but must not alter product source, package declarations, or
native implementation files.

`rc1-candidate-manifest.template.json` is the schema-3.0 starting point. The
final manifest is generated only after the source commit exists.
