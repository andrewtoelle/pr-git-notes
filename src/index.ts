import * as core from "./lib/core";
import { makeGh } from "./lib/gh";

async function main() {
	// TODO: read your action's inputs.
	const exampleInput = core.getInput("example-input");
	const token = core.getInput("github-token") || process.env.GITHUB_TOKEN || "";

	if (!token) {
		core.setFailed(
			"no github-token input and no GITHUB_TOKEN env — pass one or the other",
		);
		return;
	}
	if (!exampleInput) {
		core.setFailed("example-input is required and must be non-empty");
		return;
	}

	const gh = makeGh(token, "TODO-owner/TODO-action-name");

	// TODO: resolve owner/repo from GITHUB_REPOSITORY if your action targets a repo.
	// TODO: read GITHUB_EVENT_PATH if your action reacts to a specific event payload.
	// TODO: make your API calls via `gh("GET", "/...")`.
	// TODO: emit outputs via `core.setOutput(name, value)`.

	core.info(
		`TODO: implement action body. Got example-input=${exampleInput}. gh client ready (${typeof gh}).`,
	);
}

export { main };

function run(): void {
	main().catch((err) => {
		core.setFailed(err instanceof Error ? err.message : String(err));
	});
}
export { run };

if (import.meta.main) void run();
