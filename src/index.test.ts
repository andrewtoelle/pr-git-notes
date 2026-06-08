import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { main } from "./index";

describe("template smoke", () => {
	const origExitCode = process.exitCode;
	const origToken = process.env.GITHUB_TOKEN;
	const origInputToken = process.env.INPUT_GITHUB_TOKEN;

	beforeEach(() => {
		delete process.env.GITHUB_TOKEN;
		delete process.env.INPUT_GITHUB_TOKEN;
	});

	afterEach(() => {
		process.exitCode = origExitCode;
		if (origToken === undefined) delete process.env.GITHUB_TOKEN;
		else process.env.GITHUB_TOKEN = origToken;
		if (origInputToken === undefined) delete process.env.INPUT_GITHUB_TOKEN;
		else process.env.INPUT_GITHUB_TOKEN = origInputToken;
	});

	test("main fails fast when no token is provided", async () => {
		// TODO: replace this with real coverage of your action's behavior.
		// Currently asserts that the boilerplate token-check works end-to-end.
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
