import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";

import { ProjectTrustStore } from "@earendil-works/pi-coding-agent";
import { resolveChildProfileReference } from "pi-subagents/child-profiles";
import piExtension from "../src/extension.ts";
import { installPiProfileSubagentsAdapter } from "../src/index.ts";

function profile(tools: string[], overrides: Record<string, unknown> = {}) {
	return {
		tools,
		skills: [],
		extensions: [],
		child: {
			isolation: "process",
			context: { project: false, global: false, projectResources: "deny" },
		},
		...overrides,
	};
}

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-profile-adapter-"));
	const agentDir = path.join(root, "agent");
	const profilesDir = path.join(root, "profiles");
	const cwd = path.join(root, "project");
	fs.mkdirSync(agentDir, { recursive: true });
	fs.mkdirSync(profilesDir, { recursive: true });
	fs.mkdirSync(cwd, { recursive: true });
	return { root, agentDir, profilesDir, cwd };
}

function writeProfile(dir: string, name: string, value: unknown): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

describe("focused profile/subagents adapter", () => {
	it("resolves concurrent profiles without changing settings or active state", async () => {
		const f = fixture();
		try {
			writeProfile(f.profilesDir, "reader", profile(["read"]));
			writeProfile(f.profilesDir, "searcher", profile(["grep", "find"]));
			const settings = path.join(f.agentDir, "settings.json");
			const active = path.join(f.agentDir, "pi-profile-state.json");
			fs.writeFileSync(settings, "{\"parent\":true}\n");
			fs.writeFileSync(active, "{\"profile\":\"parent\"}\n");
			const beforeSettings = fs.readFileSync(settings, "utf8");
			const beforeActive = fs.readFileSync(active, "utf8");
			const beforeOffline = process.env.PI_OFFLINE;
			const handle = installPiProfileSubagentsAdapter({ agentDir: f.agentDir, profilesDir: f.profilesDir });
			try {
				const [reader, searcher] = await Promise.all([
					resolveChildProfileReference("pi-profile-switch:reader", { cwd: f.cwd, backend: "process" }),
					resolveChildProfileReference("pi-profile-switch:searcher", { cwd: f.cwd, backend: "process" }),
				]);
				assert.deepEqual(reader.resources.tools.map(({ name }) => name), ["read"]);
				assert.deepEqual(searcher.resources.tools.map(({ name }) => name), ["grep", "find"]);
				assert.notEqual(reader.digest, searcher.digest);
				assert.equal(fs.readFileSync(settings, "utf8"), beforeSettings);
				assert.equal(fs.readFileSync(active, "utf8"), beforeActive);
				assert.equal(process.env.PI_OFFLINE, beforeOffline);
			} finally { handle.dispose(); }
		} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});

	it("uses a fresh per-cwd trust decision and gates project profiles", async () => {
		const f = fixture();
		const other = path.join(f.root, "other-project");
		fs.mkdirSync(other, { recursive: true });
		try {
			writeProfile(path.join(f.cwd, ".pi", "profiles"), "project-review", profile(["read"]));
			writeProfile(path.join(other, ".pi", "profiles"), "project-review", profile(["grep"]));
			const visited: string[] = [];
			const handle = installPiProfileSubagentsAdapter({
				agentDir: f.agentDir,
				profilesDir: f.profilesDir,
				allowProjectProfiles: true,
				trust: { mode: "custom", key: "fixture-trust-v1", resolve(cwd) { visited.push(cwd); return cwd === f.cwd; } },
			});
			try {
				const trusted = await resolveChildProfileReference("pi-profile-switch:project-review", { cwd: f.cwd, backend: "process" });
				assert.deepEqual(trusted.resources.tools.map(({ name }) => name), ["read"]);
				await assert.rejects(
					() => resolveChildProfileReference("pi-profile-switch:project-review", { cwd: other, backend: "process" }),
					/unknown child profile/,
				);
				assert.deepEqual(visited, [f.cwd, other]);
			} finally { handle.dispose(); }
		} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});

	it("reads persisted trust per cwd without granting ambient default trust", async () => {
		const f = fixture();
		try {
			writeProfile(path.join(f.cwd, ".pi", "profiles"), "project-review", profile(["read"]));
			new ProjectTrustStore(f.agentDir).set(f.cwd, true);
			const handle = installPiProfileSubagentsAdapter({
				agentDir: f.agentDir,
				profilesDir: f.profilesDir,
				allowProjectProfiles: true,
				trust: { mode: "persisted" },
			});
			try {
				const resolved = await resolveChildProfileReference("pi-profile-switch:project-review", { cwd: f.cwd, backend: "process" });
				assert.equal(resolved.source, "project");
			} finally { handle.dispose(); }
		} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});

	it("reference-counts identical installs and rejects conflicting policy", async () => {
		const f = fixture();
		try {
			writeProfile(f.profilesDir, "lean", profile(["read"]));
			const first = installPiProfileSubagentsAdapter({ agentDir: f.agentDir, profilesDir: f.profilesDir });
			const second = installPiProfileSubagentsAdapter({ agentDir: f.agentDir, profilesDir: f.profilesDir });
			assert.equal(first.key, second.key);
			assert.throws(
				() => installPiProfileSubagentsAdapter({ agentDir: f.agentDir, profilesDir: path.join(f.root, "different") }),
				/different resolution or trust policy/,
			);
			first.dispose();
			assert.equal((await resolveChildProfileReference("pi-profile-switch:lean", { cwd: f.cwd, backend: "process" })).name, "lean");
			second.dispose();
			second.dispose();
			await assert.rejects(
				() => resolveChildProfileReference("pi-profile-switch:lean", { cwd: f.cwd, backend: "process" }),
				/provider 'pi-profile-switch' is not registered/,
			);
		} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});

	it("registers and releases through the Pi extension lifecycle", async () => {
		let shutdown: (() => void) | undefined;
		piExtension({
			on(event: string, handler: () => void) {
				if (event === "session_shutdown") shutdown = handler;
			},
		} as never);
		assert.equal(typeof shutdown, "function");
		shutdown?.();
		shutdown?.();
		await assert.rejects(
			() => resolveChildProfileReference("pi-profile-switch:any", { cwd: process.cwd(), backend: "process" }),
			/provider 'pi-profile-switch' is not registered/,
		);
	});

	it("fails closed for unsafe configuration and missing profiles", async () => {
		const f = fixture();
		try {
			assert.throws(() => installPiProfileSubagentsAdapter({ agentDir: "" }), /agentDir must be a non-empty string/);
			assert.throws(() => installPiProfileSubagentsAdapter({ agentDir: f.agentDir, providerName: "bad:name" }), /providerName may contain/);
			assert.throws(
				() => installPiProfileSubagentsAdapter({ agentDir: f.agentDir, trust: { mode: "custom", key: "", resolve: () => false } }),
				/trust.key must be a non-empty string/,
			);
			assert.throws(
				() => installPiProfileSubagentsAdapter({ agentDir: f.agentDir, allowProjectProfiles: true, trust: { mode: "deny" } }),
				/requires a per-cwd persisted or custom trust policy/,
			);
			const handle = installPiProfileSubagentsAdapter({ agentDir: f.agentDir, profilesDir: f.profilesDir });
			try {
				await assert.rejects(
					() => resolveChildProfileReference("pi-profile-switch:missing", { cwd: f.cwd, backend: "process" }),
					/unknown child profile/,
				);
			} finally { handle.dispose(); }
		} finally { fs.rmSync(f.root, { recursive: true, force: true }); }
	});
});
