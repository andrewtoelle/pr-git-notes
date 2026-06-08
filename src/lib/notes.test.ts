import { describe, expect, test } from "bun:test";
import {
	type AnchoredCommit,
	buildAnnotations,
	buildCheckRunBody,
	buildCheckText,
	buildNoteLine,
	parseNotesLog,
} from "./notes";

// Field separator (\x1f) and record separator (\x1e) match NOTES_LOG_FORMAT.
const F = "\x1f";
const R = "\x1e";
// git appends a newline after each formatted commit, so records arrive with a
// leading "\n" the parser must tolerate.
const rec = (sha: string, subject: string, note: string) =>
	`${sha}${F}${subject}${F}${note}${R}\n`;

describe("parseNotesLog", () => {
	test("parses multiple noted commits (happy path)", () => {
		const raw = rec("aaa111", "first", "note one") + rec("bbb222", "second", "note two");
		expect(parseNotesLog(raw)).toEqual([
			{ sha: "aaa111", subject: "first", note: "note one" },
			{ sha: "bbb222", subject: "second", note: "note two" },
		]);
	});

	test("preserves multi-line note bodies", () => {
		const raw = rec("ccc333", "multi", "line a\nline b");
		expect(parseNotesLog(raw)).toEqual([
			{ sha: "ccc333", subject: "multi", note: "line a\nline b" },
		]);
	});

	// Risk edge — the notes-ref refspec gotcha: notes don't transfer by default.
	// If the pre-walk fetch missed the ref, every commit's %N is empty and we
	// must render nothing rather than fabricate phantom annotations.
	test("drops commits whose note is empty", () => {
		const raw =
			rec("ddd444", "noted", "real note") + rec("eee555", "unnoted", "");
		expect(parseNotesLog(raw)).toEqual([
			{ sha: "ddd444", subject: "noted", note: "real note" },
		]);
	});

	test("returns [] for empty log output", () => {
		expect(parseNotesLog("")).toEqual([]);
	});
});

describe("buildNoteLine", () => {
	test("formats the structured write-back line", () => {
		expect(buildNoteLine("ack", "octocat", "2026-06-08T12:00:00.000Z")).toBe(
			"ack-by: octocat at 2026-06-08T12:00:00.000Z",
		);
	});
});

describe("buildAnnotations", () => {
	test("emits one annotation per commit that resolved to a path", () => {
		const commits: AnchoredCommit[] = [
			{ sha: "aaa1111", subject: "s", note: "n", path: "src/file.ts" },
		];
		const got = buildAnnotations(commits);
		expect(got).toHaveLength(1);
		expect(got[0]).toMatchObject({
			path: "src/file.ts",
			start_line: 1,
			end_line: 1,
			annotation_level: "notice",
			title: "git-note on aaa1111",
		});
		expect(got[0].message).toContain("n");
	});

	test("skips commits with no resolvable path", () => {
		const commits: AnchoredCommit[] = [
			{ sha: "bbb222", subject: "s", note: "n", path: null },
		];
		expect(buildAnnotations(commits)).toEqual([]);
	});
});

describe("buildCheckText", () => {
	test("lists each noted commit with its short sha", () => {
		const text = buildCheckText(
			[{ sha: "abcdef1234", subject: "hello", note: "the note" }],
			"refs/notes/commits",
		);
		expect(text).toContain("refs/notes/commits");
		expect(text).toContain("abcdef1");
		expect(text).toContain("the note");
	});
});

describe("buildCheckRunBody", () => {
	const commits: AnchoredCommit[] = [
		{ sha: "aaa1111", subject: "s", note: "n", path: "f.ts" },
	];

	test("reflects the noted-commit count in the title", () => {
		const body = buildCheckRunBody({
			checkName: "git-notes",
			headSha: "head000",
			notesRef: "refs/notes/commits",
			commits,
			buttons: ["ack", "resolved"],
		});
		expect(body.name).toBe("git-notes");
		expect(body.head_sha).toBe("head000");
		expect(body.output.title).toBe("1 commit(s) with notes");
		expect(body.actions).toHaveLength(2);
	});

	test("caps buttons at GitHub's limit of 3 actions", () => {
		const body = buildCheckRunBody({
			checkName: "git-notes",
			headSha: "h",
			notesRef: "refs/notes/commits",
			commits,
			buttons: ["a", "b", "c", "d", "e"],
		});
		expect(body.actions).toHaveLength(3);
	});

	test("omits actions entirely when buttons is empty (Mode β disabled)", () => {
		const body = buildCheckRunBody({
			checkName: "git-notes",
			headSha: "h",
			notesRef: "refs/notes/commits",
			commits: [],
			buttons: [],
		});
		expect(body.actions).toBeUndefined();
		expect(body.output.title).toBe("0 commit(s) with notes");
	});
});
