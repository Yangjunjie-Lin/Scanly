# Release process

Scanly v2.0.0 is already published. Future patch and minor releases follow this process without modifying earlier tags, artifacts, or qualification records.

1. Start feature/fix work from `develop` and merge through a pull request.
2. Freeze the intended release scope and update versions, changelog, public docs, package metadata, and API snapshots when applicable.
3. Run static, unit, package, browser, Native, API/ABI, security, artifact, and relevant benchmark gates.
4. Create a temporary release branch when exact-source qualification or release-candidate evidence is required.
5. Build package and Native artifacts once from the qualified source; record checksums, SBOM, licenses, provenance, and reproducibility metadata.
6. Merge the qualified release to protected `main`.
7. Create a signed SemVer tag, then a non-draft, non-prerelease GitHub Release from that tag.
8. Publish npm with provenance and attach required Native assets without replacing previously published bytes.
9. Verify npm `latest`, GitHub Release identity/assets, production deployment, and the publication record.
10. Synchronize `main` back into `develop`.

The Stable npm workflow derives the version from the signed tag and the package set from the artifact manifest. v2.0.0 retains a documented legacy registry-manifest recovery path because its immutable tarballs predate npm's repository metadata validation; later tarballs must carry canonical repository metadata internally.

Physical qualification is independent of artifact immutability. A completed post-release device program adds a separate physical qualification record and never rewrites a released binary or Stable qualification manifest.
