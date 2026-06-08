/**
 * Rendering + parsing for git-notes ↔ check-run translation. All pure:
 * `index.ts` shells out to `git log` and the Checks API, but the shape of
 * the log output, the check-run body, and the note write-back line are
 * decided here so they can be tested against fixtures.
 */

// Field/record separators for the `git log` format string. NUL (\x1f is the
// ASCII unit separator) splits fields; \x1e (record separator) splits commits.
// Both are control chars that can't appear in a SHA, subject, or note body,
// so parsing stays unambiguous even for multi-line notes.
const FIELD_SEP = "\x1f";
const RECORD_SEP = "\x1e";

/** The `--format` argument paired with {@link parseNotesLog}. */
export const NOTES_LOG_FORMAT = `--format=%H${FIELD_SEP}%s${FIELD_SEP}%N${RECORD_SEP}`;

export interface NotedCommit {
	sha: string;
	subject: string;
	note: string;
}

/** A {@link NotedCommit} annotated with the file a check-run annotation anchors to. */
export interface AnchoredCommit extends NotedCommit {
	/** First file the commit touched, or null if none could be resolved. */
	path: string | null;
}

/**
 * Parse `git log <NOTES_LOG_FORMAT>` output into commits that carry a note.
 *
 * Commits with an empty note are dropped — this is the guard against the
 * notes-ref refspec gotcha (notes don't transfer by default): if the
 * pre-walk fetch missed the ref, `%N` is empty for every commit and we
 * render nothing rather than fabricating phantom annotations.
 */
export function parseNotesLog(raw: string): NotedCommit[] {
	const out: NotedCommit[] = [];
	for (const rawRecord of raw.split(RECORD_SEP)) {
		const record = rawRecord.replace(/^\n+/, "");
		if (record.trim() === "") continue;
		const fields = record.split(FIELD_SEP);
		if (fields.length < 3) continue;
		const sha = fields[0].trim();
		const subject = fields[1];
		const note = fields.slice(2).join(FIELD_SEP).trim();
		if (sha === "" || note === "") continue;
		out.push({ sha, subject, note });
	}
	return out;
}

/** The structured line Mode β appends to a commit's note on a button click. */
export function buildNoteLine(
	identifier: string,
	actor: string,
	isoTimestamp: string,
): string {
	return `${identifier}-by: ${actor} at ${isoTimestamp}`;
}

export interface Annotation {
	path: string;
	start_line: number;
	end_line: number;
	annotation_level: "notice" | "warning" | "failure";
	title: string;
	message: string;
}

/**
 * One annotation per commit that resolved to a file path. Anchored at line 1
 * of the commit's first changed file — the spike's probe of whether GitHub
 * renders commit-anchored annotations in the PR Files-changed view (an
 * 08-01 open question). Commits with no resolvable path are surfaced via the
 * check-run text instead (see {@link buildCheckText}).
 */
export function buildAnnotations(commits: AnchoredCommit[]): Annotation[] {
	const out: Annotation[] = [];
	for (const c of commits) {
		if (!c.path) continue;
		out.push({
			path: c.path,
			start_line: 1,
			end_line: 1,
			annotation_level: "notice",
			title: `git-note on ${c.sha.slice(0, 7)}`,
			message: `${c.subject}\n\n${c.note}`,
		});
	}
	return out;
}

/** Markdown body listing every noted commit — the reliable render path. */
export function buildCheckText(commits: NotedCommit[], notesRef: string): string {
	const lines = [
		`Notes from \`${notesRef}\` on ${commits.length} commit(s):`,
		"",
	];
	for (const c of commits) {
		lines.push(
			`### \`${c.sha.slice(0, 7)}\` ${c.subject}`,
			"",
			"```",
			c.note,
			"```",
			"",
		);
	}
	return lines.join("\n");
}

export interface CheckRunAction {
	label: string;
	description: string;
	identifier: string;
}

export interface CheckRunBody {
	name: string;
	head_sha: string;
	status: "completed";
	conclusion: "neutral";
	output: {
		title: string;
		summary: string;
		text: string;
		annotations: Annotation[];
	};
	actions?: CheckRunAction[];
}

/**
 * Assemble the POST /check-runs body. Buttons are capped at GitHub's limit
 * of 3 actions, and label/identifier/description are clamped to the API's
 * length limits (20/20/40). An empty `buttons` list omits `actions`
 * entirely (Mode β disabled).
 */
export function buildCheckRunBody(opts: {
	checkName: string;
	headSha: string;
	notesRef: string;
	commits: AnchoredCommit[];
	buttons: string[];
}): CheckRunBody {
	const { checkName, headSha, notesRef, commits, buttons } = opts;
	const body: CheckRunBody = {
		name: checkName,
		head_sha: headSha,
		status: "completed",
		conclusion: "neutral",
		output: {
			title: `${commits.length} commit(s) with notes`,
			summary:
				commits.length === 0
					? `No commits in this PR carry a note in \`${notesRef}\`.`
					: `${commits.length} commit(s) carry a note in \`${notesRef}\`.`,
			text: buildCheckText(commits, notesRef),
			annotations: buildAnnotations(commits),
		},
	};
	const actions = buttons.slice(0, 3).map((id) => ({
		label: id.slice(0, 20),
		description: `Write a "${id}" note back`.slice(0, 40),
		identifier: id.slice(0, 20),
	}));
	if (actions.length > 0) body.actions = actions;
	return body;
}
