#!/usr/bin/env node
import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prototypeRoot = path.resolve(process.env.PI_PROFILE_PROTOTYPE_ROOT || path.join(repoDir, "..", "pi-profile-subagents-prototype"));
const links = [
  ["node_modules/pi-profile-switch", "repos/pi-profile-switch"],
  ["node_modules/pi-subagents", "repos/pi-subagents"],
  ["node_modules/typescript", "repos/pi-profile-switch/node_modules/typescript"],
  ["node_modules/@types", "repos/pi-profile-switch/node_modules/@types"],
  ["node_modules/@earendil-works/pi-coding-agent", "repos/pi-subagents/node_modules/@earendil-works/pi-coding-agent"],
];

for (const [relativeLink, relativeTarget] of links) {
  const link = path.join(repoDir, relativeLink);
  const target = path.join(prototypeRoot, relativeTarget);
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
