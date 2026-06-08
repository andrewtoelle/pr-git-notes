/**
 * Minimal GitHub REST wrapper. Replaces `@octokit/request` in the
 * production bundle.
 *
 * Why bespoke: `@octokit/request` pulls `undici` (~1MB+ of transport
 * code) into the bundle. node24 ships `fetch` natively, which uses the
 * runtime's own HTTP stack — zero added bundle weight.
 *
 * `@octokit/request` is still installed as a devDependency. Use it
 * INTERACTIVELY (e.g., a scratch script outside `src/`) to discover
 * endpoint shapes, response types, and parameter validation. Once
 * you've shaped a call against octokit's types, port it down to a
 * `gh(...)` invocation here. Octokit is the reference; this file is
 * the production surface.
 *
 * Grow this file cautiously — add helpers only when call sites
 * actually duplicate.
 */

export interface GhInit extends Omit<RequestInit, "headers" | "body" | "method"> {
	headers?: Record<string, string>;
	body?: unknown;
}

export type GhMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface GhResponse<T> {
	status: number;
	data: T;
}

export interface GhClient {
	<T = unknown>(
		method: GhMethod,
		path: string,
		init?: GhInit,
	): Promise<GhResponse<T>>;
}

export function makeGh(token: string, userAgent: string): GhClient {
	return async function gh<T>(
		method: GhMethod,
		path: string,
		init: GhInit = {},
	): Promise<GhResponse<T>> {
		const { body, headers, ...rest } = init;
		const res = await fetch(`https://api.github.com${path}`, {
			...rest,
			method,
			headers: {
				authorization: `token ${token}`,
				"user-agent": userAgent,
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
				...(body !== undefined ? { "content-type": "application/json" } : {}),
				...headers,
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
		const text = await res.text();
		if (!res.ok) {
			throw new Error(
				`GitHub API ${method} ${path} → ${res.status}: ${text}`,
			);
		}
		const data = (text ? JSON.parse(text) : null) as T;
		return { status: res.status, data };
	};
}
