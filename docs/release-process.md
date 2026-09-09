# Release process

Scanly v2.0.0 is already published and immutable. v2.0.1 and later Stable releases use a dedicated `release/stable/vX.Y.Z/` directory so earlier tags, artifacts, qualification manifests, and publication records are never overwritten.

1. Start feature/fix work from `develop` and merge through a pull request.
2. Freeze the intended release scope and update versions, changelog, public docs, package metadata, and API snapshots when applicable.
3. Run static, unit, package, browser, Native, API/ABI, security, artifact, and relevant benchmark gates.
4. Commit the exact intended source on `develop`; only `main` and `develop` are retained as long-lived branches.
5. Build package and Native artifacts twice from that qualified source, compare canonical content, and record checksums, SBOM, licenses, provenance, and reproducibility metadata in `release/stable/vX.Y.Z/`.
6. Merge the qualified release to protected `main`.
7. Create a signed SemVer tag, then a non-draft, non-prerelease GitHub Release from that tag.
8. Publish npm through GitHub Actions OIDC Trusted Publishing with provenance and attach required Native assets without replacing previously published bytes. No long-lived npm token is used for v2.0.1 or later.
9. Verify npm `latest`, GitHub Release identity/assets, production deployment, and the publication record.
10. Synchronize `main` back into `develop`.

The Stable npm workflow derives the version from the signed tag and selects `release/stable/vX.Y.Z/artifact-manifest.json`. v2.0.0 alone retains its root-level frozen layout and documented legacy registry-manifest recovery path because its immutable tarballs predate npm's repository metadata validation; later tarballs must carry canonical repository metadata internally and publish only through the configured OIDC Trusted Publisher.

Physical qualification is independent of artifact immutability. A completed post-release device program adds a separate physical qualification record and never rewrites a released binary or Stable qualification manifest.
