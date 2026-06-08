import { describe, expect, test } from "bun:test";
import {
	authRemoteUrl,
	normalizeNotesRef,
	parseButtons,
	parseRepoSlug,
	resolveToken,
} from "./config";

describe("resolveToken", () => {
	test("prefers the explicit input over the env token", () => {
		expect(resolveToken("input-tok", "env-tok")).toBe("input-tok");
	});

	test("falls back to the env token when input is empty", () => {
		expect(resolveToken("", "env-tok")).toBe("env-tok");
	});

	test("returns empty string when neither is set (caller fails fast)", () => {
		expect(resolveToken("", undefined)).toBe("");
	});
});

describe("parseRepoSlug", () => {
	test("splits a well-formed owner/repo slug", () => {
		expect(parseRepoSlug("andrewtoelle/pr-git-notes")).toEqual({
			owner: "andrewtoelle",
			repo: "pr-git-notes",
		});
	});

	test("returns null for a malformed slug (no slash)", () => {
		expect(parseRepoSlug("just-a-name")).toBeNull();
	});

	test("returns null for undefined / empty", () => {
		expect(parseRepoSlug(undefined)).toBeNull();
		expect(parseRepoSlug("")).toBeNull();
	});

	test("returns null when there are extra path segments", () => {
		expect(parseRepoSlug("a/b/c")).toBeNull();
	});
});

describe("normalizeNotesRef", () => {
	test("qualifies a short name", () => {
		expect(normalizeNotesRef("commits")).toBe("refs/notes/commits");
	});

	test("passes through an already-qualified ref", () => {
		expect(normalizeNotesRef("refs/notes/review-notes")).toBe(
			"refs/notes/review-notes",
		);
	});

	test("falls back to the default when empty", () => {
		expect(normalizeNotesRef("")).toBe("refs/notes/commits");
		expect(normalizeNotesRef("   ")).toBe("refs/notes/commits");
	});
});

describe("parseButtons", () => {
	test("splits and trims comma-separated identifiers", () => {
		expect(parseButtons("ack, resolved")).toEqual(["ack", "resolved"]);
	});

	test("drops empty entries", () => {
		expect(parseButtons("ack,,resolved,")).toEqual(["ack", "resolved"]);
	});

	test("returns an empty list for an empty input (Mode β disabled)", () => {
		expect(parseButtons("")).toEqual([]);
		expect(parseButtons("  ")).toEqual([]);
	});
});

describe("authRemoteUrl", () => {
	test("embeds the token for HTTPS push/fetch auth", () => {
		expect(authRemoteUrl("tok", "andrewtoelle", "pr-git-notes")).toBe(
			"https://x-access-token:tok@github.com/andrewtoelle/pr-git-notes.git",
		);
	});
});
