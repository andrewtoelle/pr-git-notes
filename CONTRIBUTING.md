# Contributing

## Build & test

```sh
bun install        # install devDeps
bun run typecheck  # strict TS check, no emit
bun test           # run colocated tests
bun run build      # bundle to dist/index.js
```

`dist/index.js` is the action's runtime entry. **It is committed** — see `RELEASING.md`.

## Source layout

```
src/
├── index.ts          # entry point; imports from ./lib/*
├── index.test.ts     # smoke test
└── lib/
    ├── core.ts       # minimal @actions/core stand-in
    ├── core.test.ts
    ├── gh.ts         # minimal GitHub REST wrapper over fetch
    └── gh.test.ts
```

- `src/index.ts` exports `main` (test-importable) and `run` (auto-invoked when bundled via `if (import.meta.main)`).
- Tests are colocated with the file under test (`*.test.ts` sibling), not in a separate `test/` tree.

## Official GitHub libraries: reference, not dependency

This template deliberately ships **bespoke replacements** for both `@actions/core` (replaced by `src/lib/core.ts`) and `@octokit/*` (replaced by `src/lib/gh.ts`). Both official libs are excellent, but both pull `undici` into the production bundle through different paths:

- `@actions/core` → `@actions/http-client` → `undici` (~1MB, evaluated at module-eval time even if `getIDToken()` is never called and no proxy is configured).
- `@octokit/request` → `undici` (similar magnitude, direct dependency).

For an action whose entire job is "call a few REST endpoints and emit outputs," that's an asymmetric trade-off: the action's actual logic is often <100 lines, but the bundle would be 95% transport-layer plumbing. node24's native `fetch` (and bun's, when developing locally) provides all the HTTP we need.

**The convention**: read the official libs as references. Port the minimum surface area into `lib/core.ts` and `lib/gh.ts`. Don't import official GH libs from anything under `src/` that ends up in `dist/`.

### Using octokit / actions-core for prototyping

Both are installed as devDependencies. Use them in **scratch scripts outside `src/`** to:

1. Discover endpoint shapes via octokit's TypeScript types — `@octokit/request`'s parameter and response types describe every endpoint.
2. Verify behavior interactively before porting (`bun run --silent prototype.ts` against a real token).
3. Read the canonical source for the GitHub Actions runner contract — `@actions/core`'s implementation of any helper is the authoritative spec for env vars and workflow commands.

Recommended pattern: put ad-hoc octokit / actions-core experiments under a `scripts/prototype/` directory. Port working calls down to `lib/gh.ts` / `lib/core.ts` once stable. Delete the prototype script or keep it as inline documentation — your call, but it must never be reachable from `src/index.ts`.

### Growing the bespoke libs

When `lib/core.ts` is missing a function:

1. Find the corresponding helper in `@actions/core`'s source on GitHub.
2. Port the minimum logic — omit unrelated branches (OIDC, proxy handling, large-output chunking unless you need it).
3. Add a colocated test.
4. Never add `@actions/core` as a runtime dependency, even temporarily — a single resolved import pulls the full chain.

When `lib/gh.ts` is missing a method or convenience:

1. Look up the endpoint shape in `@octokit/request`'s types (or the GitHub REST docs).
2. Either: (a) call `gh("METHOD", "/path", { body })` directly from `src/index.ts`, or (b) add a typed helper to `lib/gh.ts` if more than one call site uses it.
3. Add a colocated test that mocks `globalThis.fetch`.

### Build-time enforcement

The release ritual greps `dist/index.js` for `OidcClient | undici | ProxyAgent` and fails if any are found. Each substring is a fingerprint of a different bloat path:

- `OidcClient` — `@actions/core` snuck in (the only place this identifier lives is `@actions/core/lib/oidc-utils`).
- `undici` — either `@actions/core` or `@octokit/*` did, OR a different undici-using dep was added.
- `ProxyAgent` — usually `undici`-via-`@actions/http-client`.

If the grep fails, the bundle has gained a dependency that defeats the template's whole premise. Find the import (usually a fresh `import` in `src/`), revert it, port the needed functionality to `lib/`, and re-bundle.

## Releasing

See [RELEASING.md](./RELEASING.md).
