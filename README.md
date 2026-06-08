# pr-git-notes

_Surface git-notes attached to PR commits as a check-run, with check-button write-back._

GitHub renders [git-notes](https://git-scm.com/docs/git-notes) nowhere in its web UI, so review metadata attached to commits via `git notes add` stays invisible in the PR. This action closes that gap: on `pull_request` events it fetches `refs/notes/*`, walks the PR's commits, and renders each commit's note as a check-run annotation visible right in the PR's Checks tab and Files-changed view. It also offers check-run action buttons (e.g. `ack`, `resolved`) so a reviewer can write a note _back_ to a commit — recorded in git history forever — without leaving the PR.

The action is **dual-mode**: a single `action.yml` selects its handler at runtime from `GITHUB_EVENT_NAME`. Wire one job to both event types and each invocation runs the handler that matches the firing event.

- **Mode α (read)** — fires on `pull_request`. Fetches the notes ref, walks `base..head`, and creates/updates a check run whose annotations carry each commit's note. Emits `noted-commit-count` and `check-run-id`.
- **Mode β (write-back)** — fires on `check_run.requested_action` (a reviewer clicked a button). Appends a structured line to the targeted commit's note and pushes the notes ref to origin. Emits `acted-on-sha` and `action-identifier`.

## Inputs

| Name           | Required | Default                  | Description                                                                                                                                                                                                 |
| -------------- | -------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-token` | no       | `${{ github.token }}`    | Token for the Checks API and the notes-ref push. Needs `checks: write` (both modes) plus `contents: write` for Mode β's push (`contents: read` suffices for Mode α alone). Pass a custom PAT only when escaping `GITHUB_TOKEN` workflow-chaining limits on the button click. |
| `notes-ref`    | no       | `refs/notes/commits`     | Which git-notes namespace to surface and write back to. Use distinct refs to run multiple instances for separate concerns (e.g. `refs/notes/review-notes` vs. `refs/notes/deploy-notes`).                  |
| `buttons`      | no       | `ack,resolved`           | Comma-separated check-run action-button identifiers offered in Mode α and handled in Mode β. Each becomes a clickable button on the check; the clicked one is reported as `action-identifier`. Empty string disables Mode β (read-only). |
| `check-name`   | no       | `git-notes`              | Name of the check run created/updated in Mode α. Distinct values produce independent checks so multiple instances on one PR don't collide.                                                                  |

## Outputs

| Name                | Description                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `noted-commit-count` | _Mode α only._ Number of PR commits that carry a note in `notes-ref` (integer as a string).                 |
| `check-run-id`      | _Mode α only._ ID of the check run created or updated for this PR.                                           |
| `acted-on-sha`      | _Mode β only._ The commit SHA the clicked button targeted (the check run's `head_sha`).                      |
| `action-identifier` | _Mode β only._ Which button identifier the reviewer clicked (one of the `buttons` values, e.g. `ack`).       |

Because the two modes fire on different events, only one pair of outputs is populated per run. A job triggered by `pull_request` reads the Mode α outputs; a job triggered by `check_run` reads the Mode β outputs. Don't expect both populated simultaneously.

## Permissions

The consumer workflow's job must grant:

```yaml
permissions:
  checks: write # create/update the check run (Mode α) and read the requested_action payload (Mode β)
  contents: write # push refs/notes/* back to origin on a button click (Mode β)
  pull-requests: read # enumerate the PR's commits via the API without depending on a checkout
```

- `checks: write` — required by both modes. Mode α POSTs/PATCHes the check run; Mode β receives the `check_run.requested_action` payload.
- `contents: write` — required only for Mode β's notes-ref push. If you run Mode α exclusively (`buttons: ""`), `contents: read` is sufficient.
- `pull-requests: read` — lets Mode α enumerate the PR's commits via the REST API rather than relying on a full checkout.

> [!IMPORTANT]
> git-notes do **not** transfer with a normal fetch. The action fetches them itself with the explicit `+refs/notes/*:refs/notes/*` refspec, so your `actions/checkout` step does not need to fetch notes — but any local tooling that expects to see them must use that refspec too.

## Example workflow

```yaml
name: PR git-notes
on:
  pull_request:
    types: [opened, synchronize, reopened]
  check_run:
    types: [requested_action]

permissions:
  checks: write
  contents: write
  pull-requests: read

jobs:
  git-notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: andrewtoelle/pr-git-notes@v0
        with:
          notes-ref: refs/notes/commits
          buttons: ack,resolved
          check-name: git-notes
```

## Status

v0.1.0 — initial spike, experimental. Built from the `gh-action-template` skeleton to test three open questions: whether `GITHUB_TOKEN`-created check buttons chain a workflow on click, how commit-anchored annotations render in the PR, and how `refs/notes/*` pushes behave under a fine-grained PAT.

## License

MIT — see [LICENSE](./LICENSE).
