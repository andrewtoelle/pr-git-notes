# Releasing

## Cutting a release

1. Update `package.json` `version` to the new semver (`0.1.0`, `0.1.1`, `1.0.0`, …).
2. `bun run build` — regenerate `dist/index.js`.
3. `bun test && bun run typecheck` — verify clean.
4. Verify the bundle didn't regrow: `ls -l dist/index.js`. A 0.x action with only `lib/core.ts` + `lib/gh.ts` should be ≤5 KB. Anything dramatically larger usually means a devDep was accidentally imported from `src/` — see `CONTRIBUTING.md` § Build-time enforcement.
5. Verify no bloat fingerprints in the bundle:
   ```sh
   grep -c 'OidcClient\|undici\|ProxyAgent' dist/index.js
   # Expect 0. Non-zero → an official GH lib leaked into the bundle. Fix before tagging.
   ```
6. Commit: `chore(release): vX.Y.Z` (include both `package.json` and `dist/index.js`).
7. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z — <one-line summary>" && git push origin vX.Y.Z`.
8. Update the floating major-version tag (after the first stable release):
   ```sh
   git tag -f vX && git push origin vX --force
   ```
   Consumers pinning `@vX` get the new minor/patch on their next workflow run. Skip this step for 0.x releases — semver convention is that pre-stable, consumers pin specific minor versions rather than floating.
9. Write release notes via `gh release create vX.Y.Z --generate-notes`, then edit to call out any breaking changes prominently.

## Breaking changes

Bump the major version. Consumers on `@v<previous-major>` keep working. The README's "Versioning" section is where the breaking-change behavior is documented per release — update it.

## The `dist/` commit

`dist/index.js` is generated, NOT hand-edited. If the diff for a release commit shows changes to `dist/` that weren't caused by `bun run build`, abort and rebuild. Keep `dist/` and source in lockstep on every release commit — never ship a release where they diverge.

The grep in step 5 is the load-bearing safety net: it's the single command that distinguishes "consumers download a ~2 KB action" from "consumers download a ~1 MB action with `undici` baked in." Don't skip it.
