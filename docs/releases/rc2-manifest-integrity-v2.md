# RC2 Manifest integrity schema v2

RC2 candidate `v2-rc2-r1` and RC1 candidate `v2-rc1-r1` are immutable historical audit records. Their embedded `manifestSha256` values have no documented canonicalization algorithm and are classified as `LEGACY_MANIFEST_HASH_UNVERIFIED`; they are never reported as raw-file SHA-256 passes.

Schema `rc2-final-candidate-manifest-2` removes the self-referential digest field. The exact UTF-8, LF, no-BOM bytes of `release/rc2/rc2-candidate-manifest.v2.json` are hashed with SHA-256, and the lowercase digest is stored in `release/rc2/rc2-candidate-manifest.v2.json.sha256` using the standard two-space sidecar form.

Run the independent verifier with:

```sh
npm run rc:manifest:verify
```

Before a Candidate tag exists this verifies the complete content graph and reports `CANDIDATE_TAG_NOT_PRESENT`. After the annotated Candidate tag is created, release CI uses `--require-candidate-tag` and requires its peeled target to equal the exact Evidence Head. The Manifest records the pre-existing qualification base rather than attempting to embed the commit that contains itself.

The verifier recomputes:

- the detached Manifest digest and encoding policy;
- Product Source commit/tree and the evidence-only source boundary;
- every frozen artifact raw SHA-256 and size;
- the SBOM, license, reproducibility, Physical Matrix, Signing Policy, and deployment identities;
- the immutable tag objects and targets for RC1 r1 and RC2 r1;
- fail-closed Physical, Signing, blocker, and Stable state consistency.

## Candidate audit trail

`v2-rc2-r2` is an immutable historical Candidate. It targets Evidence Head `5d125e141b3133ff887fbc6c79132186e567163a` and introduced the schema-v2 detached Manifest with raw digest `dedc5dc09ae8a344ce023978751a68793998b60208b3e8ae7ad23bc58784cb9f`. GitHub rejected both RC Artifact Build push runs (`31950465373` and `31950466051`) before creating any job because the workflow referenced the runner-only `runner.temp` context from job-level `env`. No Product Source or frozen artifact was implicated. The tag is retained without movement or rewriting.

`v2-rc2-r3` is also retained as an immutable historical Candidate. It targets Evidence Head `7077ddfa65fda8be81e6be86f5e7619815f5df99`, uses raw Manifest digest `12aa04ed8004a1dceda183b8af72f257986e722d3999abcfd93a66e1677f6ab5`, and repaired the Artifact Build workflow validation. Its exact-head CI run `31950939431` then exposed a test-only environment-contract error: six Manifest negative tests requested a local canonical-recompute bypass that the verifier correctly refused under GitHub Actions. The failure did not implicate Product Source; 580 other unit tests passed.

The corrective Candidate is `v2-rc2-r4`. The canonical artifact recomputation bypass has been removed entirely from both the verifier and its tests, so negative tests exercise the same recomputation path as release CI.

## Cross-platform npm rebuild equivalence

Raw npm tarballs remain identified only by their exact SHA-256; different raw hashes are never called identical. CI rebuild comparison uses `scanly-npm-package-canonical-1`: gzip/tar metadata is excluded, archive headers and paths are validated, entries are sorted by UTF-8 path, strict UTF-8 non-binary content has CRLF or CR normalized to LF, and path/content records are length-framed before SHA-256. This permits a Windows-frozen package and an Ubuntu rebuild to prove package-content equivalence without claiming raw-byte equality.

## Stable fail-closed boundary

The current Physical Matrix schema v1 and Signing Policy schema v1 remain requirements/audit records and cannot produce Stable GO. `Stable Release Gate` therefore remains red until new externally supported Physical and production-signing evidence schemas are added and verified. A successful integrity-mode run establishes `RC2_MANIFEST_INTEGRITY_GO`; it does not promote Physical, Signing, or Stable qualification.
