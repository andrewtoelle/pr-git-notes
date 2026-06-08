import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./index";

// main()'s detailed parsing/validation is covered by the pure helpers in
// lib/{config,event,notes}.test.ts. These two tests only pin the top-level
// dispatch contract: irrelevant events exit clean, and a relevant event with
// no token fails fast — both reachable without spawning git or hitting the API.
describe("main dispatch", () => {
	const env = process.env;
	const saved: Record<string, string | undefined> = {};
	const keys = [
		"GITHUB_EVENT_NAME",
		"GITHUB_TOKEN",
		"INPUT_GITHUB_TOKEN",
		"GITHUB_REPOSITORY",
		"GITHUB_EVENT_PATH",
		"GITHUB_OUTPUT",
	];

	beforeEach(() => {
		for (const k of keys) saved[k] = env[k];
		for (const k of keys) delete env[k];
		// Route outputs to a throwaway file so initOutputs() stays quiet.
		const dir = mkdtempSync(join(tmpdir(), "pr-git-notes-"));
		const out = join(dir, "out");
		writeFileSync(out, "");
		env.GITHUB_OUTPUT = out;
		process.exitCode = undefined;
	});

	afterEach(() => {
		for (const k of keys) {
			if (saved[k] === undefined) delete env[k];
			else env[k] = saved[k];
		}
		process.exitCode = undefined;
	});

	test("exits cleanly for an irrelevant event (no setFailed)", async () => {
		env.GITHUB_EVENT_NAME = "push";
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			await main();
			expect(process.exitCode).toBeUndefined();
			expect(logSpy).toHaveBeenCalledWith(
				expect.stringContaining("nothing to do"),
			);
		} finally {
			logSpy.mockRestore();
		}
	});

	test("fails fast on a relevant event with no token", async () => {
		env.GITHUB_EVENT_NAME = "pull_request";
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			await main();
			expect(process.exitCode).toBe(1);
			expect(logSpy).toHaveBeenCalledWith(
				expect.stringContaining("::error::no github-token"),
			);
		} finally {
			logSpy.mockRestore();
		}
	});
});
