import { afterEach, describe, expect, test } from "bun:test";
import { makeGh } from "./gh";

describe("makeGh", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("composes headers and base URL", async () => {
		let captured: { url: string; init: RequestInit } | null = null;
		globalThis.fetch = (async (url: string, init: RequestInit) => {
			captured = { url: String(url), init };
			return new Response(JSON.stringify({ ok: true }), { status: 200 });
		}) as unknown as typeof fetch;

		const gh = makeGh("test-token", "test-ua");
		const { status, data } = await gh<{ ok: boolean }>("GET", "/repos/foo/bar");

		expect(status).toBe(200);
		expect(data.ok).toBe(true);
		expect(captured).not.toBeNull();
		expect(captured!.url).toBe("https://api.github.com/repos/foo/bar");
		const headers = captured!.init.headers as Record<string, string>;
		expect(headers.authorization).toBe("token test-token");
		expect(headers["user-agent"]).toBe("test-ua");
		expect(headers.accept).toBe("application/vnd.github+json");
	});

	test("serializes body and sets content-type when body present", async () => {
		let captured: { init: RequestInit } | null = null;
		globalThis.fetch = (async (_url: string, init: RequestInit) => {
			captured = { init };
			return new Response("{}", { status: 201 });
		}) as unknown as typeof fetch;

		const gh = makeGh("t", "ua");
		await gh("POST", "/repos/foo/bar/issues/1/comments", { body: { body: "hi" } });

		expect(captured).not.toBeNull();
		expect(captured!.init.body).toBe(JSON.stringify({ body: "hi" }));
		expect(
			(captured!.init.headers as Record<string, string>)["content-type"],
		).toBe("application/json");
	});

	test("throws on non-2xx with status and response body in message", async () => {
		globalThis.fetch = (async () =>
			new Response("nope", { status: 404 })) as unknown as typeof fetch;
		const gh = makeGh("t", "ua");
		await expect(gh("GET", "/whatever")).rejects.toThrow(/404.*nope/);
	});

	test("returns null data on empty response body", async () => {
		globalThis.fetch = (async () =>
			new Response("", { status: 204 })) as unknown as typeof fetch;
		const gh = makeGh("t", "ua");
		const { status, data } = await gh("DELETE", "/repos/foo/bar/something");
		expect(status).toBe(204);
		expect(data).toBeNull();
	});
});
