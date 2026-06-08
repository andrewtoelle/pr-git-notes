import { describe, expect, test } from "bun:test";
import { parsePrEvent, parseRequestedAction, selectMode } from "./event";

describe("selectMode", () => {
	test("pull_request and pull_request_target dispatch to read (Mode α)", () => {
		expect(selectMode("pull_request")).toBe("read");
		expect(selectMode("pull_request_target")).toBe("read");
	});

	test("check_run dispatches to write (Mode β)", () => {
		expect(selectMode("check_run")).toBe("write");
	});

	test("irrelevant events are ignored", () => {
		expect(selectMode("push")).toBe("ignore");
		expect(selectMode(undefined)).toBe("ignore");
	});
});

describe("parsePrEvent", () => {
	test("extracts number + base/head SHAs from a PR payload (happy path)", () => {
		const payload = {
			pull_request: {
				number: 7,
				base: { sha: "base000" },
				head: { sha: "head111" },
			},
		};
		expect(parsePrEvent(payload)).toEqual({
			number: 7,
			baseSha: "base000",
			headSha: "head111",
		});
	});

	test("returns null for an irrelevant payload with no pull_request", () => {
		expect(parsePrEvent({ check_run: {} })).toBeNull();
		expect(parsePrEvent(null)).toBeNull();
	});

	test("returns null when a SHA is missing/malformed", () => {
		expect(
			parsePrEvent({ pull_request: { number: 1, base: { sha: "b" } } }),
		).toBeNull();
		expect(
			parsePrEvent({
				pull_request: { number: "1", base: { sha: "b" }, head: { sha: "h" } },
			}),
		).toBeNull();
	});
});

describe("parseRequestedAction", () => {
	test("extracts identifier + head_sha + actor on a requested_action (happy path)", () => {
		const payload = {
			action: "requested_action",
			requested_action: { identifier: "ack" },
			check_run: { head_sha: "deadbeef" },
			sender: { login: "octocat" },
		};
		expect(parseRequestedAction(payload)).toEqual({
			identifier: "ack",
			headSha: "deadbeef",
			actor: "octocat",
		});
	});

	test("returns null for a non-requested_action check_run activity", () => {
		expect(
			parseRequestedAction({ action: "completed", check_run: { head_sha: "x" } }),
		).toBeNull();
	});

	test("returns null when the identifier or head_sha is missing", () => {
		expect(
			parseRequestedAction({
				action: "requested_action",
				requested_action: {},
				check_run: { head_sha: "x" },
			}),
		).toBeNull();
		expect(
			parseRequestedAction({
				action: "requested_action",
				requested_action: { identifier: "ack" },
				check_run: {},
			}),
		).toBeNull();
	});

	test("defaults actor to 'unknown' when sender.login is absent", () => {
		const got = parseRequestedAction({
			action: "requested_action",
			requested_action: { identifier: "ack" },
			check_run: { head_sha: "x" },
		});
		expect(got?.actor).toBe("unknown");
	});
});
