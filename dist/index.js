import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/index.ts
import { readFileSync } from "node:fs";

// src/lib/config.ts
function resolveToken(input, envToken) {
  return input || envToken || "";
}
function parseRepoSlug(slug) {
  const [owner, repo, ...rest] = (slug ?? "").split("/");
  if (!owner || !repo || rest.length > 0)
    return null;
  return { owner, repo };
}
function normalizeNotesRef(ref) {
  const r = ref.trim() || "refs/notes/commits";
  return r.startsWith("refs/notes/") ? r : `refs/notes/${r}`;
}
function parseButtons(raw) {
  return raw.split(",").map((s) => s.trim()).filter((s) => s !== "");
}
function authRemoteUrl(token, owner, repo) {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

// src/lib/core.ts
import { appendFileSync } from "node:fs";
function getInput(name) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return (process.env[key] ?? "").trim();
}
function setOutput(name, value) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) {
    console.log(`::set-output name=${name}::${value}`);
    return;
  }
  const delim = `__gh_action_output_eof_${Math.random().toString(36).slice(2, 10)}__`;
  appendFileSync(path, `${name}<<${delim}
${value}
${delim}
`);
}
function setFailed(message) {
  console.log(`::error::${message.replace(/\r?\n/g, "%0A")}`);
  process.exitCode = 1;
}
function info(message) {
  console.log(message);
}

// src/lib/event.ts
function selectMode(eventName) {
  if (eventName === "pull_request" || eventName === "pull_request_target") {
    return "read";
  }
  if (eventName === "check_run")
    return "write";
  return "ignore";
}
function parsePrEvent(payload) {
  const pr = payload?.pull_request;
  if (!pr)
    return null;
  const { number } = pr;
  const baseSha = pr.base?.sha;
  const headSha = pr.head?.sha;
  if (typeof number !== "number" || typeof baseSha !== "string" || typeof headSha !== "string") {
    return null;
  }
  return { number, baseSha, headSha };
}
function parseRequestedAction(payload) {
  const p = payload;
  if (p?.action !== "requested_action")
    return null;
  const identifier = p.requested_action?.identifier;
  const headSha = p.check_run?.head_sha;
  if (typeof identifier !== "string" || identifier === "")
    return null;
  if (typeof headSha !== "string" || headSha === "")
    return null;
  const actor = typeof p.sender?.login === "string" ? p.sender.login : "unknown";
  return { identifier, headSha, actor };
}

// src/lib/git.ts
import { spawnSync } from "node:child_process";
function git(args) {
  const res = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  return {
    status: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? ""
  };
}
function gitOrThrow(args) {
  const res = git(args);
  if (res.status !== 0) {
    throw new Error(`git ${args.join(" ")} → exit ${res.status}: ${res.stderr.trim()}`);
  }
  return res.stdout.trim();
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

// src/lib/notes.ts
var FIELD_SEP = "\x1F";
var RECORD_SEP = "\x1E";
var NOTES_LOG_FORMAT = `--format=%H${FIELD_SEP}%s${FIELD_SEP}%N${RECORD_SEP}`;
function parseNotesLog(raw) {
  const out = [];
  for (const rawRecord of raw.split(RECORD_SEP)) {
    const record = rawRecord.replace(/^\n+/, "");
    if (record.trim() === "")
      continue;
    const fields = record.split(FIELD_SEP);
    if (fields.length < 3)
      continue;
    const sha = fields[0].trim();
    const subject = fields[1];
    const note = fields.slice(2).join(FIELD_SEP).trim();
    if (sha === "" || note === "")
      continue;
    out.push({ sha, subject, note });
  }
  return out;
}
function buildNoteLine(identifier, actor, isoTimestamp) {
  return `${identifier}-by: ${actor} at ${isoTimestamp}`;
}
function buildAnnotations(commits) {
  const out = [];
  for (const c of commits) {
    if (!c.path)
      continue;
    out.push({
      path: c.path,
      start_line: 1,
      end_line: 1,
      annotation_level: "notice",
      title: `git-note on ${c.sha.slice(0, 7)}`,
      message: `${c.subject}

${c.note}`
    });
  }
  return out;
}
function buildCheckText(commits, notesRef) {
  const lines = [
    `Notes from \`${notesRef}\` on ${commits.length} commit(s):`,
    ""
  ];
  for (const c of commits) {
    lines.push(`### \`${c.sha.slice(0, 7)}\` ${c.subject}`, "", "```", c.note, "```", "");
  }
  return lines.join(`
`);
}
function buildCheckRunBody(opts) {
  const { checkName, headSha, notesRef, commits, buttons } = opts;
  const body = {
    name: checkName,
    head_sha: headSha,
    status: "completed",
    conclusion: "neutral",
    output: {
      title: `${commits.length} commit(s) with notes`,
      summary: commits.length === 0 ? `No commits in this PR carry a note in \`${notesRef}\`.` : `${commits.length} commit(s) carry a note in \`${notesRef}\`.`,
      text: buildCheckText(commits, notesRef),
      annotations: buildAnnotations(commits)
    }
  };
  const actions = buttons.slice(0, 3).map((id) => ({
    label: id.slice(0, 20),
    description: `Write a "${id}" note back`.slice(0, 40),
    identifier: id.slice(0, 20)
  }));
  if (actions.length > 0)
    body.actions = actions;
  return body;
}

// src/index.ts
var USER_AGENT = "andrewtoelle/pr-git-notes";
function loadBaseContext() {
  const token = resolveToken(getInput("github-token"), process.env.GITHUB_TOKEN);
  if (!token) {
    setFailed("no github-token input and no GITHUB_TOKEN env — pass one or the other");
    return null;
  }
  const slug = parseRepoSlug(process.env.GITHUB_REPOSITORY);
  if (!slug) {
    setFailed(`GITHUB_REPOSITORY env missing or malformed: "${process.env.GITHUB_REPOSITORY ?? ""}"`);
    return null;
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    setFailed("GITHUB_EVENT_PATH env missing");
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(eventPath, "utf8"));
  } catch (err) {
    setFailed(`failed to read event payload: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  const notesRef = normalizeNotesRef(getInput("notes-ref"));
  return { token, owner: slug.owner, repo: slug.repo, notesRef, payload };
}
function initOutputs() {
  setOutput("noted-commit-count", "");
  setOutput("check-run-id", "");
  setOutput("acted-on-sha", "");
  setOutput("action-identifier", "");
}
function firstChangedFile(sha) {
  const res = git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha]);
  if (res.status !== 0)
    return null;
  const first = res.stdout.split(`
`).find((l) => l.trim() !== "");
  return first ? first.trim() : null;
}
async function runRead(ctx, gh) {
  const pr = parsePrEvent(ctx.payload);
  if (!pr) {
    info("not a usable pull_request payload — nothing to surface");
    return;
  }
  const remote = authRemoteUrl(ctx.token, ctx.owner, ctx.repo);
  const fetched = git(["fetch", remote, `+${ctx.notesRef}:${ctx.notesRef}`]);
  if (fetched.status !== 0) {
    info(`no ${ctx.notesRef} on origin (or fetch failed) — continuing with whatever is local`);
  }
  const log = git([
    "log",
    `${pr.baseSha}..${pr.headSha}`,
    `--notes=${ctx.notesRef}`,
    NOTES_LOG_FORMAT
  ]);
  if (log.status !== 0) {
    setFailed(`git log ${pr.baseSha}..${pr.headSha} failed — ensure the checkout used fetch-depth: 0. ${log.stderr.trim()}`);
    return;
  }
  const noted = parseNotesLog(log.stdout);
  const commits = noted.map((c) => ({
    ...c,
    path: firstChangedFile(c.sha)
  }));
  const buttons = parseButtons(getInput("buttons"));
  const checkName = getInput("check-name") || "git-notes";
  const body = buildCheckRunBody({
    checkName,
    headSha: pr.headSha,
    notesRef: ctx.notesRef,
    commits,
    buttons
  });
  const { data } = await gh("POST", `/repos/${ctx.owner}/${ctx.repo}/check-runs`, { body });
  setOutput("noted-commit-count", String(commits.length));
  setOutput("check-run-id", String(data.id));
  info(`created check run ${data.id} (${checkName}) for ${commits.length} noted commit(s)`);
}
async function runWrite(ctx) {
  const action = parseRequestedAction(ctx.payload);
  if (!action) {
    info("check_run event is not a requested_action — nothing to write back");
    return;
  }
  const buttons = parseButtons(getInput("buttons"));
  if (buttons.length === 0) {
    info("buttons input is empty — Mode β disabled, ignoring click");
    return;
  }
  if (!buttons.includes(action.identifier)) {
    info(`clicked identifier "${action.identifier}" is not a configured button — ignoring`);
    return;
  }
  const remote = authRemoteUrl(ctx.token, ctx.owner, ctx.repo);
  const fetched = git(["fetch", remote, `+${ctx.notesRef}:${ctx.notesRef}`]);
  if (fetched.status !== 0) {
    info(`no existing ${ctx.notesRef} on origin — starting a fresh note`);
  }
  const line = buildNoteLine(action.identifier, action.actor, new Date().toISOString());
  gitOrThrow([
    "notes",
    `--ref=${ctx.notesRef}`,
    "append",
    "-m",
    line,
    action.headSha
  ]);
  gitOrThrow(["push", remote, `${ctx.notesRef}:${ctx.notesRef}`]);
  setOutput("acted-on-sha", action.headSha);
  setOutput("action-identifier", action.identifier);
  info(`appended note to ${action.headSha.slice(0, 7)}: "${line}"`);
}
async function main() {
  initOutputs();
  const mode = selectMode(process.env.GITHUB_EVENT_NAME);
  if (mode === "ignore") {
    info(`event "${process.env.GITHUB_EVENT_NAME ?? "(unset)"}" is not pull_request or check_run — nothing to do`);
    return;
  }
  const ctx = loadBaseContext();
  if (!ctx)
    return;
  const gh = makeGh(ctx.token, USER_AGENT);
  if (mode === "read")
    await runRead(ctx, gh);
  else
    await runWrite(ctx);
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
