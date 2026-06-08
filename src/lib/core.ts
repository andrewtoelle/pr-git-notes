import { appendFileSync } from "node:fs";

/**
 * Minimal stand-ins for the `@actions/core` surface area this action uses.
 *
 * `@actions/core`'s main entry imports `OidcClient` from `./oidc-utils.js`,
 * which imports `HttpClient` from `@actions/http-client`, which imports
 * `ProxyAgent` from `undici` — all at module-eval time, unconditionally.
 * That import chain alone bloats the bundle by ~17K lines (~1 MB) even
 * though this action never calls `getIDToken` and never proxies.
 *
 * The four functions below are the entire `@actions/core` surface area
 * this action touches. Each is a thin wrapper around the underlying
 * GitHub Actions runner contract (env vars + workflow commands on stdout).
 */

export function getInput(name: string): string {
	const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
	return (process.env[key] ?? "").trim();
}

export function setOutput(name: string, value: string): void {
	const path = process.env.GITHUB_OUTPUT;
	if (!path) {
		// Pre-GITHUB_OUTPUT fallback (deprecated by GitHub but still honored).
		console.log(`::set-output name=${name}::${value}`);
		return;
	}
	// Heredoc form matches @actions/core; safe for any value, incl. newlines.
	const delim = `__gh_action_output_eof_${Math.random().toString(36).slice(2, 10)}__`;
	appendFileSync(path, `${name}<<${delim}\n${value}\n${delim}\n`);
}

export function setFailed(message: string): void {
	console.log(`::error::${message.replace(/\r?\n/g, "%0A")}`);
	process.exitCode = 1;
}

export function info(message: string): void {
	console.log(message);
}
