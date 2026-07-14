## Summary

Describe the focused maintenance or decoding change and why it is needed.

## Verification

- [ ] `npm run check`
- [ ] `npm run test:e2e` (or affected browser projects)
- [ ] `npm run benchmark:smoke`
- [ ] Full `npm run benchmark` if decoding/fixture contracts changed
- [ ] No required fixture, expected payload, or gate was weakened
- [ ] No secret, `.vercel/`, temporary fixture, or smoke artifact is tracked
- [ ] Documentation/changelog updated where needed

## Benchmark impact

Report pass rate, regressions, multiple completeness, attempts, and retained failures. Use “not applicable” only when decoding logic is untouched.
