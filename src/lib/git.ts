import { spawnSync } from "node:child_process";

/**
 * Tiny `spawnSync`-based wrapper around the `git` binary. GitHub runners
 * ship git pre-installed, so this adds zero dependency weight — the action
 * shells out for the few notes operations the Checks API can't do:
 * fetching `refs/notes/*` (which don't transfer by default), walking the
 * PR's commit range with `--notes`, appending a note, and pushing the
 * notes ref back to origin.
 */

export interface GitResult {
	status: number;
	stdout: string;
	stderr: string;
}

/** Run `git <args>` and capture the result without throwing. */
export function git(args: string[]): GitResult {
	const res = spawnSync("git", args, {
		encoding: "utf8",
		// Notes logs over a large PR can be sizable; lift the default 1 MB cap.
		maxBuffer: 64 * 1024 * 1024,
	});
	return {
		status: res.status ?? -1,
		stdout: res.stdout ?? "",
		stderr: res.stderr ?? "",
	};
}

/** Run `git <args>`, returning trimmed stdout; throw with stderr on failure. */
export function gitOrThrow(args: string[]): string {
	const res = git(args);
	if (res.status !== 0) {
		throw new Error(
			`git ${args.join(" ")} → exit ${res.status}: ${res.stderr.trim()}`,
		);
	}
	return res.stdout.trim();
}
