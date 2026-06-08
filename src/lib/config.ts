/**
 * Pure helpers for resolving the action's inputs and runner environment
 * into validated config. No side effects — every function here is a plain
 * data transform so the validation logic is unit-testable without invoking
 * `main()` or touching `process.env`.
 */

/** Resolve the GitHub token: explicit input wins, then GITHUB_TOKEN env. */
export function resolveToken(input: string, envToken: string | undefined): string {
	return input || envToken || "";
}

/** Parse a `owner/repo` slug (from GITHUB_REPOSITORY). Null if malformed. */
export function parseRepoSlug(
	slug: string | undefined,
): { owner: string; repo: string } | null {
	const [owner, repo, ...rest] = (slug ?? "").split("/");
	if (!owner || !repo || rest.length > 0) return null;
	return { owner, repo };
}

/**
 * Normalize a notes-ref input to its fully-qualified `refs/notes/<name>`
 * form. Accepts both the short name (`commits`) and the full ref
 * (`refs/notes/commits`); empty falls back to the action.yml default.
 */
export function normalizeNotesRef(ref: string): string {
	const r = ref.trim() || "refs/notes/commits";
	return r.startsWith("refs/notes/") ? r : `refs/notes/${r}`;
}

/**
 * Parse the comma-separated `buttons` input into trimmed identifiers.
 * Empty / whitespace-only entries are dropped; an empty result means
 * Mode β is disabled (no buttons offered, no write-back).
 */
export function parseButtons(raw: string): string[] {
	return raw
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s !== "");
}

/** Build an HTTPS push/fetch URL with the token embedded for auth. */
export function authRemoteUrl(token: string, owner: string, repo: string): string {
	return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}
