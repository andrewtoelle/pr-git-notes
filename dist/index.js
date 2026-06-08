import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/lib/core.ts
function getInput(name) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return (process.env[key] ?? "").trim();
}
function setFailed(message) {
  console.log(`::error::${message.replace(/\r?\n/g, "%0A")}`);
  process.exitCode = 1;
}
function info(message) {
  console.log(message);
}

// src/lib/gh.ts
function makeGh(token, userAgent) {
  return async function gh(method, path, init = {}) {
    const { body, headers, ...rest } = init;
    const res = await fetch(`https://api.github.com${path}`, {
      ...rest,
      method,
      headers: {
        authorization: `token ${token}`,
        "user-agent": userAgent,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...body !== undefined ? { "content-type": "application/json" } : {},
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text}`);
    }
    const data = text ? JSON.parse(text) : null;
    return { status: res.status, data };
  };
}

// src/index.ts
async function main() {
  const exampleInput = getInput("example-input");
  const token = getInput("github-token") || process.env.GITHUB_TOKEN || "";
  if (!token) {
    setFailed("no github-token input and no GITHUB_TOKEN env — pass one or the other");
    return;
  }
  if (!exampleInput) {
    setFailed("example-input is required and must be non-empty");
    return;
  }
  const gh = makeGh(token, "TODO-owner/TODO-action-name");
  info(`TODO: implement action body. Got example-input=${exampleInput}. gh client ready (${typeof gh}).`);
}
function run() {
  main().catch((err) => {
    setFailed(err instanceof Error ? err.message : String(err));
  });
}
if (__require.main == __require.module)
  run();
export {
  run,
  main
};
