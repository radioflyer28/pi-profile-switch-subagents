#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compatibility = JSON.parse(readFileSync(path.join(root, "compatibility.json"), "utf8"));
const adapter = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const failures = [];

if (adapter.name !== compatibility.adapter?.name) failures.push(`adapter name: expected ${compatibility.adapter?.name}, got ${adapter.name}`);
if (adapter.version !== compatibility.adapter?.version) failures.push(`adapter version: expected ${compatibility.adapter?.version}, got ${adapter.version}`);

for (const [name, expected] of Object.entries(compatibility.dependencies ?? {})) {
  const directory = path.join(root, "upstream", name);
  let commit;
  try {
    commit = execFileSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch (error) {
    failures.push(`${name}: submodule is unavailable (${error instanceof Error ? error.message : String(error)})`);
    continue;
  }
  if (commit !== expected.commit) failures.push(`${name}: expected commit ${expected.commit}, got ${commit}`);
  try {
    const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));
    if (manifest.name !== name) failures.push(`${name}: package name is ${manifest.name}`);
    if (manifest.version !== expected.packageVersion) failures.push(`${name}: expected package version ${expected.packageVersion}, got ${manifest.version}`);
  } catch (error) {
    failures.push(`${name}: cannot read package manifest (${error instanceof Error ? error.message : String(error)})`);
  }
}

if (failures.length) {
  console.error(["Compatibility verification failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}
console.log(`Compatibility verified: ${adapter.name}@${adapter.version}`);
for (const [name, expected] of Object.entries(compatibility.dependencies)) console.log(`- ${name}@${expected.packageVersion} ${expected.commit}`);
