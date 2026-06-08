/**
 * Pure parsers over the GitHub event payload. The action is dual-mode:
 * `main()` reads GITHUB_EVENT_NAME, asks `selectMode` which handler to run,
 * then extracts the fields that handler needs from the payload JSON. Keeping
 * these as null-returning pure functions lets the dispatch logic be tested
 * against fixture payloads without spawning git or hitting the API.
 */

/** Which handler a given GITHUB_EVENT_NAME dispatches to. */
export type Mode = "read" | "write" | "ignore";

export function selectMode(eventName: string | undefined): Mode {
	if (eventName === "pull_request" || eventName === "pull_request_target") {
		return "read";
	}
	if (eventName === "check_run") return "write";
	return "ignore";
}

/** The commit range + PR number a Mode α run operates over. */
export interface PrRefs {
	number: number;
	baseSha: string;
	headSha: string;
}

/**
 * Extract the PR commit range from a `pull_request` payload. Returns null
 * for any payload that isn't a well-formed PR event (e.g. the action wired
 * to an unrelated trigger) — the caller treats null as "nothing to do".
 */
export function parsePrEvent(payload: unknown): PrRefs | null {
	const pr = (payload as { pull_request?: unknown } | null)?.pull_request as
		| { number?: unknown; base?: { sha?: unknown }; head?: { sha?: unknown } }
		| undefined;
	if (!pr) return null;
	const { number } = pr;
	const baseSha = pr.base?.sha;
	const headSha = pr.head?.sha;
	if (
		typeof number !== "number" ||
		typeof baseSha !== "string" ||
		typeof headSha !== "string"
	) {
		return null;
	}
	return { number, baseSha, headSha };
}

/** The button click a Mode β run handles. */
export interface RequestedAction {
	identifier: string;
	headSha: string;
	actor: string;
}

/**
 * Extract the clicked button + target commit from a `check_run` payload.
 * Returns null unless the payload is specifically a `requested_action`
 * activity carrying a non-empty identifier and a head SHA — other
 * `check_run` activities (created/completed/rerequested) are ignored.
 */
export function parseRequestedAction(payload: unknown): RequestedAction | null {
	const p = payload as {
		action?: unknown;
		requested_action?: { identifier?: unknown };
		check_run?: { head_sha?: unknown };
		sender?: { login?: unknown };
	} | null;
	if (p?.action !== "requested_action") return null;
	const identifier = p.requested_action?.identifier;
	const headSha = p.check_run?.head_sha;
	if (typeof identifier !== "string" || identifier === "") return null;
	if (typeof headSha !== "string" || headSha === "") return null;
	const actor = typeof p.sender?.login === "string" ? p.sender.login : "unknown";
	return { identifier, headSha, actor };
}
