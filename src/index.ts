import { readFileSync } from "node:fs";
import {
	authRemoteUrl,
	normalizeNotesRef,
	parseButtons,
	parseRepoSlug,
	resolveToken,
} from "./lib/config";
import * as core from "./lib/core";
import { parsePrEvent, parseRequestedAction, selectMode } from "./lib/event";
import { git, gitOrThrow } from "./lib/git";
import { type GhClient, makeGh } from "./lib/gh";
import {
	type AnchoredCommit,
	buildCheckRunBody,
	buildNoteLine,
	NOTES_LOG_FORMAT,
	parseNotesLog,
} from "./lib/notes";

const USER_AGENT = "andrewtoelle/pr-git-notes";

interface CheckRunResponse {
	id: number;
}

/** Shared config every mode needs, or null after a fail-fast / clean exit. */
interface BaseContext {
	token: string;
	owner: string;
	repo: string;
	notesRef: string;
	payload: unknown;
}

/**
 * Resolve + validate the inputs and runner env both modes share. Calls
 * `setFailed` and returns null on actual misuse (missing token, malformed
 * GITHUB_REPOSITORY, unreadable event payload).
 */
function loadBaseContext(): BaseContext | null {
	const token = resolveToken(core.getInput("github-token"), process.env.GITHUB_TOKEN);
	if (!token) {
		core.setFailed(
			"no github-token input and no GITHUB_TOKEN env — pass one or the other",
		);
		return null;
	}

	const slug = parseRepoSlug(process.env.GITHUB_REPOSITORY);
	if (!slug) {
		core.setFailed(
			`GITHUB_REPOSITORY env missing or malformed: "${process.env.GITHUB_REPOSITORY ?? ""}"`,
		);
		return null;
	}

	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) {
		core.setFailed("GITHUB_EVENT_PATH env missing");
		return null;
	}
	let payload: unknown;
	try {
		payload = JSON.parse(readFileSync(eventPath, "utf8"));
	} catch (err) {
		core.setFailed(
			`failed to read event payload: ${err instanceof Error ? err.message : String(err)}`,
		);
		return null;
	}

	const notesRef = normalizeNotesRef(core.getInput("notes-ref"));
	return { token, owner: slug.owner, repo: slug.repo, notesRef, payload };
}

/** Initialize every declared output to empty so consumers can rely on them existing. */
function initOutputs(): void {
	core.setOutput("noted-commit-count", "");
	core.setOutput("check-run-id", "");
	core.setOutput("acted-on-sha", "");
	core.setOutput("action-identifier", "");
}

/** Resolve the first file a commit touched, for annotation anchoring. */
function firstChangedFile(sha: string): string | null {
	const res = git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
	if (res.status !== 0) return null;
	const first = res.stdout.split("\n").find((l) => l.trim() !== "");
	return first ? first.trim() : null;
}

/**
 * Mode α (read): fetch notes, walk the PR's commit range, render each
 * commit's note into a check run with per-commit annotations + buttons.
 */
async function runRead(ctx: BaseContext, gh: GhClient): Promise<void> {
	const pr = parsePrEvent(ctx.payload);
	if (!pr) {
		core.info("not a usable pull_request payload — nothing to surface");
		return;
	}

	const remote = authRemoteUrl(ctx.token, ctx.owner, ctx.repo);
	// Notes refs don't transfer by default; fetch the explicit refspec. A
	// missing ref on origin is fine (no notes yet) — log and carry on.
	const fetched = git(["fetch", remote, `+${ctx.notesRef}:${ctx.notesRef}`]);
	if (fetched.status !== 0) {
		core.info(
			`no ${ctx.notesRef} on origin (or fetch failed) — continuing with whatever is local`,
		);
	}

	const log = git([
		"log",
		`${pr.baseSha}..${pr.headSha}`,
		`--notes=${ctx.notesRef}`,
		NOTES_LOG_FORMAT,
	]);
	if (log.status !== 0) {
		core.setFailed(
			`git log ${pr.baseSha}..${pr.headSha} failed — ensure the checkout used fetch-depth: 0. ${log.stderr.trim()}`,
		);
		return;
	}

	const noted = parseNotesLog(log.stdout);
	const commits: AnchoredCommit[] = noted.map((c) => ({
		...c,
		path: firstChangedFile(c.sha),
	}));

	const buttons = parseButtons(core.getInput("buttons"));
	const checkName = core.getInput("check-name") || "git-notes";
	const body = buildCheckRunBody({
		checkName,
		headSha: pr.headSha,
		notesRef: ctx.notesRef,
		commits,
		buttons,
	});

	const { data } = await gh<CheckRunResponse>(
		"POST",
		`/repos/${ctx.owner}/${ctx.repo}/check-runs`,
		{ body },
	);

	core.setOutput("noted-commit-count", String(commits.length));
	core.setOutput("check-run-id", String(data.id));
	core.info(
		`created check run ${data.id} (${checkName}) for ${commits.length} noted commit(s)`,
	);
}

/**
 * Mode β (write-back): a reviewer clicked a check-run button. Append a
 * structured line to the targeted commit's note and push the notes ref.
 */
async function runWrite(ctx: BaseContext): Promise<void> {
	const action = parseRequestedAction(ctx.payload);
	if (!action) {
		core.info("check_run event is not a requested_action — nothing to write back");
		return;
	}

	const buttons = parseButtons(core.getInput("buttons"));
	if (buttons.length === 0) {
		core.info("buttons input is empty — Mode β disabled, ignoring click");
		return;
	}
	if (!buttons.includes(action.identifier)) {
		core.info(
			`clicked identifier "${action.identifier}" is not a configured button — ignoring`,
		);
		return;
	}

	const remote = authRemoteUrl(ctx.token, ctx.owner, ctx.repo);
	const fetched = git(["fetch", remote, `+${ctx.notesRef}:${ctx.notesRef}`]);
	if (fetched.status !== 0) {
		core.info(`no existing ${ctx.notesRef} on origin — starting a fresh note`);
	}

	const line = buildNoteLine(action.identifier, action.actor, new Date().toISOString());
	gitOrThrow([
		"notes",
		`--ref=${ctx.notesRef}`,
		"append",
		"-m",
		line,
		action.headSha,
	]);
	gitOrThrow(["push", remote, `${ctx.notesRef}:${ctx.notesRef}`]);

	core.setOutput("acted-on-sha", action.headSha);
	core.setOutput("action-identifier", action.identifier);
	core.info(`appended note to ${action.headSha.slice(0, 7)}: "${line}"`);
}

async function main(): Promise<void> {
	initOutputs();

	const mode = selectMode(process.env.GITHUB_EVENT_NAME);
	if (mode === "ignore") {
		core.info(
			`event "${process.env.GITHUB_EVENT_NAME ?? "(unset)"}" is not pull_request or check_run — nothing to do`,
		);
		return;
	}

	const ctx = loadBaseContext();
	if (!ctx) return; // loadBaseContext already called setFailed.

	const gh = makeGh(ctx.token, USER_AGENT);
	if (mode === "read") await runRead(ctx, gh);
	else await runWrite(ctx);
}

export { main };

// Only auto-run when invoked as the entry. Tests import helpers directly.
function run(): void {
	main().catch((err) => {
		core.setFailed(err instanceof Error ? err.message : String(err));
	});
}
export { run };

if (import.meta.main) void run();
