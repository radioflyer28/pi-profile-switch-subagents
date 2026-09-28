import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

import { installPiProfileSubagentsAdapter } from "../src/index.ts";
import { makeAgent, makeMinimalCtx } from "../../../repos/pi-subagents/test/support/helpers.ts";
import {
	available,
	installSingleExecutionHooks,
	makeExecutor,
	mockPi,
	readCall,
	tempDir,
} from "../../../repos/pi-subagents/test/support/single-execution-fixture.ts";

describe("adapter to public child launch", { skip: !available ? "Pi test packages unavailable" : undefined }, () => {
	installSingleExecutionHooks();

	it("resolves through the adapter before launch and preserves the parent agent", async () => {
		const profilesDir = path.join(tempDir, "profiles");
		const agentDir = path.join(tempDir, "agent");
		fs.mkdirSync(profilesDir, { recursive: true });
		fs.mkdirSync(agentDir, { recursive: true });
		fs.writeFileSync(path.join(profilesDir, "lean.json"), JSON.stringify({
			tools: ["read"],
			skills: [],
			extensions: [],
			child: {
				isolation: "session",
				context: { project: false, global: false, projectResources: "deny" },
			},
		}));
		const parentAgent = makeAgent("reviewer", {
			tools: ["read", "grep"],
			skills: ["parent-skill"],
			extensions: ["/parent-extension.ts"],
		});
		const parentSnapshot = structuredClone(parentAgent);
		const handle = installPiProfileSubagentsAdapter({ agentDir, profilesDir });
		try {
			mockPi.onCall({ output: "reviewed" });
			const result = await makeExecutor([parentAgent]).execute(
				"adapter-profiled-child",
				{ agent: "reviewer", profile: "pi-profile-switch:lean", task: "Review", async: false },
				new AbortController().signal,
				undefined,
				makeMinimalCtx(tempDir),
			);
			assert.equal(result.isError, undefined, result.content[0]?.text ?? "launch failed");
			const call = readCall();
			assert.deepEqual(call.launch?.tools, ["read"]);
			assert.equal(call.launch?.noSkills, true);
			assert.equal(call.launch?.ambientExtensions, false);
			assert.deepEqual(call.launch?.extensionPaths, []);
			assert.equal(call.launch?.resolvedChildProfile?.name, "lean");
			assert.deepEqual(parentAgent, parentSnapshot);
		} finally {
			handle.dispose();
		}
	});
});
