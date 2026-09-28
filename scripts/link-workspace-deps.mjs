#!/usr/bin/env node
import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(process.env.PI_PROFILE_WORKSPACE_ROOT || repoDir);
const links = [
  ["node_modules/pi-profile-switch", "upstream/pi-profile-switch"],
  ["node_modules/pi-subagents", "upstream/pi-subagents"],
  ["node_modules/typescript", "upstream/pi-profile-switch/node_modules/typescript"],
  ["node_modules/@types", "upstream/pi-profile-switch/node_modules/@types"],
  ["node_modules/@earendil-works/pi-coding-agent", "upstream/pi-subagents/node_modules/@earendil-works/pi-coding-agent"],
];

for (const [relativeLink, relativeTarget] of links) {
  const link = path.join(repoDir, relativeLink);
  const target = path.join(workspaceRoot, relativeTarget);
  await mkdir(path.dirname(link), { recursive: true });
  try {
    const stat = await lstat(link);
    if (!stat.isSymbolicLink()) throw new Error(`refusing to replace non-link development dependency: ${link}`);
    await readlink(link);
    await rm(link);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await symlink(target, link, process.platform === "win32" ? "junction" : "dir");
  console.log(`${relativeLink} -> ${target}`);
}
