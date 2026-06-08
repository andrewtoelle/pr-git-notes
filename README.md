<!-- This is a template README. Search for "TODO-" markers and replace before publishing. -->

# TODO-action-name

TODO: one-paragraph description of what this action does, who it's for, and what problem it solves. Keep it tight — the next section shows usage, which is what most readers actually need.

## Usage

```yaml
name: TODO-workflow-name
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  example:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: TODO-owner/TODO-action-name@v0
        with:
          example-input: "TODO: replace with a real value"
```

> [!IMPORTANT]
> TODO: any non-obvious gotcha (permissions, event types required, runner constraints). Delete this callout if not applicable.

## Inputs

| Name            | Required | Description                                                                                                                          |
| --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `example-input` | yes      | TODO: describe the input. Mark required true/false per actual use.                                                                   |
| `github-token`  | no       | Token with the scopes your action needs. Resolution order: explicit input → `GITHUB_TOKEN` env var. Pass explicitly only when using a custom PAT — e.g. to post as a bot identity. |

## Outputs

TODO: describe the output shape. Two common patterns:

1. **Static outputs** declared in `action.yml`'s `outputs:` block. Reference them as `${{ steps.<step-id>.outputs.<name> }}`.
2. **Dynamic outputs** emitted at runtime via `core.setOutput(name, value)` and NOT declared in `action.yml` (delete the `outputs:` block entirely in that case — an empty mapping is rejected). Reference by name regardless.

## Behavior

- **First invocation**: TODO — describe the initial-state behavior.
- **Subsequent invocations**: TODO — describe what changes (idempotent? reconciled? appended?).
- **Edge cases**: TODO — empty inputs, missing PR context, permission failures.

## Versioning

Tagged releases follow semver. Consumers can pin a specific version (`@vX.Y.Z`) or track the floating major-version tag (`@vX`) for non-breaking updates. Breaking changes bump the major; the previous major-version tag continues to work for existing consumers until they choose to upgrade.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the build/test/release setup and the conventions this template establishes (notably: why `@actions/core` and `@octokit/*` are devDeps, not production deps).

## License

MIT — see [LICENSE](./LICENSE).
