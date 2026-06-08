import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getInput, info, setFailed, setOutput } from "./core";

describe("getInput", () => {
	const keys: string[] = [];
	afterEach(() => {
		for (const k of keys) delete process.env[k];
		keys.length = 0;
	});

	test("reads INPUT_<NAME> and trims whitespace", () => {
		process.env.INPUT_FOO = "  bar  ";
		keys.push("INPUT_FOO");
		expect(getInput("foo")).toBe("bar");
	});

	test("returns empty string when input is unset", () => {
		delete process.env.INPUT_MISSING;
		expect(getInput("missing")).toBe("");
	});

	test("uppercases the name", () => {
		process.env.INPUT_MIXEDCASE = "v";
		keys.push("INPUT_MIXEDCASE");
		expect(getInput("MixedCase")).toBe("v");
	});

	test("replaces spaces with underscores in the name", () => {
		process.env.INPUT_GITHUB_TOKEN = "tok";
		keys.push("INPUT_GITHUB_TOKEN");
		expect(getInput("github token")).toBe("tok");
	});
});

describe("setOutput", () => {
	let outFile: string;
	let dir: string;
	const origOutput = process.env.GITHUB_OUTPUT;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "gh-action-template-core-"));
		outFile = join(dir, "out");
		writeFileSync(outFile, "");
		process.env.GITHUB_OUTPUT = outFile;
	});

	afterEach(() => {
		if (origOutput === undefined) delete process.env.GITHUB_OUTPUT;
		else process.env.GITHUB_OUTPUT = origOutput;
	});

	test("writes a heredoc-framed entry to GITHUB_OUTPUT", () => {
		setOutput("my-gate", "true");
		const contents = readFileSync(outFile, "utf8");
		expect(contents).toMatch(
			/^my-gate<<__gh_action_output_eof_[a-z0-9]+__\ntrue\n__gh_action_output_eof_[a-z0-9]+__\n$/,
		);
	});

	test("supports multi-line values via heredoc", () => {
		setOutput("blob", "line1\nline2");
		const contents = readFileSync(outFile, "utf8");
		expect(contents).toContain("blob<<__gh_action_output_eof_");
		expect(contents).toContain("\nline1\nline2\n");
	});

	test("falls back to ::set-output when GITHUB_OUTPUT is unset", () => {
		delete process.env.GITHUB_OUTPUT;
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			setOutput("name", "value");
			expect(logSpy).toHaveBeenCalledWith("::set-output name=name::value");
		} finally {
			logSpy.mockRestore();
		}
	});
});

describe("setFailed", () => {
	const origExitCode = process.exitCode;
	afterEach(() => {
		process.exitCode = origExitCode;
	});

	test("emits ::error:: workflow command and sets exitCode=1", () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			setFailed("nope");
			expect(logSpy).toHaveBeenCalledWith("::error::nope");
			expect(process.exitCode).toBe(1);
		} finally {
			logSpy.mockRestore();
		}
	});

	test("encodes newlines as %0A in the workflow command", () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			setFailed("line1\nline2\r\nline3");
			expect(logSpy).toHaveBeenCalledWith("::error::line1%0Aline2%0Aline3");
		} finally {
			logSpy.mockRestore();
		}
	});
});

describe("info", () => {
	test("prints the message verbatim to stdout", () => {
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			info("hello");
			expect(logSpy).toHaveBeenCalledWith("hello");
		} finally {
			logSpy.mockRestore();
		}
	});
});
