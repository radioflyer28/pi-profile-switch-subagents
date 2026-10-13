# Upstream integration assessment — 2026-10-13

## Scope and method

The initial assessment checked canonical GitHub repository metadata, freshly fetched default branches, upstream release notes, relevant source changes, and non-mutating merge simulations. Following that assessment, the operator authorized local checkpoint/integration commits and a direct-maintainer exception to profile-switch's staged workflow. The integration outcome below supersedes the initial no-integration state. No push, publication, release, or further installed package setting changes were authorized or performed.

Fetched snapshots are retained as `refs/upstream-audit/2026-10-13/main` in each corresponding checkout. Commit counts below compare committed fork HEAD against that snapshot; they are not counts of missing features. The initial merge simulations excluded uncommitted fixes. Subsequent integrated validation is recorded below.

## Recommendations

| Maintained project | Canonical upstream snapshot | Assessment |
| --- | --- | --- |
| pi-subagents, feature/child-profile-launch | nicobailon/pi-subagents 0.78.0, a4c8ced69a8176cdf4179b127feddc8875e3418f | High priority: integrate upstream while retaining immutable child-profile support. 221 upstream-only commits, one fork-only commit. |
| pi-profile-switch, indirect adapter dependency | VincentFF/pi-profile-switch 0.16.0, 5d378fa6193f61fb7d771e97daed9608014d3023 | Worth integrating separately; preserve Windows linkless operation, npm-shim launch, child-profile resolver/provider, and per-target trust. 21 upstream-only commits, eight fork-only commits. |
| pi-pwsh-notify-secure | oversk7/pi-pwsh-notify 0.5.0, 4a7a48a03e3db3a6d7da901c5d0db1668560be85 | No new upstream changes beyond the explicitly reviewed baseline. Do not merge the old baseline merely because Git still shows it as upstream-only. |
| pi-compact-till | Original radioflyer28 repository, not a GitHub fork | No separate canonical upstream identified. |
| pi-profile-switch-subagents | Original radioflyer28 integration superproject, not a GitHub fork | No direct external upstream; changes flow through its two maintained fork dependencies. |

## pi-subagents: strongest update candidate

[Upstream 0.78.0 release notes](https://github.com/nicobailon/pi-subagents/blob/a4c8ced69a8176cdf4179b127feddc8875e3418f/CHANGELOG.md) document:

- Pi 1.2 background-launch compatibility: require chord only when the host declares it ([31022abc](https://github.com/nicobailon/pi-subagents/commit/31022abc)). Earlier changes also handle removal of agent-core's node entry point ([10694a67](https://github.com/nicobailon/pi-subagents/commit/10694a67)). These overlap local compatibility fixes and should be reconciled, not blindly stacked.
- Correct tool-result handling and tool-budget exhaustion reporting ([86e25e17](https://github.com/nicobailon/pi-subagents/commit/86e25e17), [4cafe20a](https://github.com/nicobailon/pi-subagents/commit/4cafe20a)).
- Release workflow capacity after children fail to launch, stop, or finish with dead runners ([e28d10ea](https://github.com/nicobailon/pi-subagents/commit/e28d10ea), [1455d3e8](https://github.com/nicobailon/pi-subagents/commit/1455d3e8)).
- Preserve prior reports on resume and publish validated structured output to file-only paths ([45891397](https://github.com/nicobailon/pi-subagents/commit/45891397), [7dc204ec](https://github.com/nicobailon/pi-subagents/commit/7dc204ec)).
- Earlier 0.77 changes ignore project settings and agents when project trust is declined ([30a13205](https://github.com/nicobailon/pi-subagents/commit/30a13205), [005a380e](https://github.com/nicobailon/pi-subagents/commit/005a380e)), and 0.78 limits repeated control-inbox logging, including Windows EPERM failures ([df6d2b98](https://github.com/nicobailon/pi-subagents/commit/df6d2b98)).
- Smaller parent tool descriptions and report previews, prompt-cache reuse, and prevention of background wakes immediately undoing Esc. These are behavior changes requiring smoke checks, not compatibility-only edits.

The committed-HEAD merge simulation found three conflicts:

- `src/runs/background/async-resume.ts`
- `src/runs/foreground/subagent-executor.ts`
- `src/runs/shared/child-session.ts`

Recommendation: protect the uncommitted compatibility work first, then integrate the full 0.78.0 upstream snapshot on a dedicated branch retaining feature/child-profile-launch. If a full sync is deferred, consider a bounded compatibility/correctness patch set, but review dependencies between commits. Re-run actual-Pi 1.2 launch, resume, steering, trust, tool-budget, acceptance, profile-provider, and output-preservation tests. The observed shell-less workers have not been proven fixed by any of these changes.

## pi-profile-switch: useful features, larger fork integration risk

[Upstream release notes](https://github.com/VincentFF/pi-profile-switch/blob/5d378fa6193f61fb7d771e97daed9608014d3023/CHANGELOG.md) show native Pi MCP adoption, valid MCP snapshots/gateway access, empty MCP allowlist enforcement, preserved user skill exclusions, sparse resource selection, native subagent overrides, and tolerant activation.

The new [native subagent settings ADR](https://github.com/VincentFF/pi-profile-switch/blob/5d378fa6193f61fb7d771e97daed9608014d3023/docs/adr/0017-native-subagent-settings-overrides.md) describes sparse role-setting overrides, not the fork's exact immutable child launch profiles. It is therefore not evidence that the custom adapter can be removed.

The vanilla upstream tree lacks the fork's child-profile resolver/provider and Windows runtime-mirror modules. Its launcher uses `node:child_process.spawn` rather than the fork's npm-shim-aware `cross-spawn`. Replacing the fork outright would lose those additions; a proper merge must preserve and reconcile them.

The committed-HEAD merge simulation found 15 conflicted files, including launcher spawn, settings generation, profile catalog/schema, in-session switching, package metadata/lockfile, tests, and documentation.

Recommendation: a separate deliberate integration after subagents, not an automatic dependency bump. Prioritize MCP restriction correctness and skill-exclusion fixes if only a small patch set is wanted. Validate Windows startup without privileged symlinks, exact child profile resolution, per-target trust, and existing adapter behavior. Update the adapter's immutable dependency pins and `compatibility.json` only after validating a compatible pair.

## PowerShell: no upstream drift

`npm run check:upstream -- --fetch` exited 0 and reported:

> Reviewed upstream baseline: v0.5.0 (4a7a48a03e3db3a6d7da901c5d0db1668560be85)
> No upstream commits beyond the reviewed baseline.

The maintained [upstream-sync policy](../pi-pwsh-notify/docs/maintenance/upstream-sync.md) states that 0.5.0 was selectively adapted onto older history, not merged. Git's one upstream-only commit is that already-reviewed release, not a new update. Existing secure policies must remain intact.

## Suggested order

1. Save/review the current Pi 1.2 compatibility fixes without dropping any nested-repository work.
2. Integrate pi-subagents 0.78.0 on a dedicated branch while keeping child-profile support.
3. Separately integrate pi-profile-switch 0.16.0 while keeping Windows and profile-provider additions.
4. Validate the adapter against the resulting pair before repinning or publishing.
5. Leave PowerShell upstream sync alone; deploy its existing compatibility fixes separately when authorized.


## Local integration outcome

- Compaction compatibility checkpoint: `dbe7c196432366462e6e176eb9796b1b180ae9db`.
- PowerShell compatibility checkpoint: `16f3cc16e38068ed84e8423859d4ee6ad34bb2a9`.
- Subagents two-parent merge: `4a63a06f88c8acefa7ae6c0009c365cf045a73e1`, incorporating upstream `a4c8ced69a8176cdf4179b127feddc8875e3418f` after compatibility checkpoint `156f4f7406b71a705ac666860a174e282aca9ce2`.
- Profile-switch two-parent merge: `786242521a44cf547a8084b239a6f169755da8b8`, incorporating upstream `5d378fa6193f61fb7d771e97daed9608014d3023` while retaining Windows mirrors/shims, strict child resolution and per-target trust. The Windows ADR is now `0019-windows-linkless-instance-mirror.md` to avoid the upstream ADR numbering collision.

### Validation evidence

- Compaction: actual Pi 1.2 host, 83 tests; typecheck, package dry-run and loader smoke passed.
- PowerShell: actual Pi 1.2 host, 64 unit plus 55 integration/codemode tests passed. A notification timing assertion passed isolated rerun without production changes.
- Integrated subagents: 3,901 unit tests passed, 87 skipped; 1,160 integration tests passed, 67 skipped; zero failures. Local and actual-host typechecks, package build and actual Pi 1.2 offline SDK lifecycle/API-identity/leaf-coordinator allowlist smoke passed.
- Integrated profile-switch: 52 suites, 860 passed, 9 skipped, zero failures; local and actual Pi 1.2 typechecks passed. Final command: `npm test -- --maxWorkers=2 --testTimeout=15000 --hookTimeout=30000` (bg-51). Default-limit full runs encountered non-reproducible 5-second test / 10-second fixture-hook timeouts; affected suites passed separately (111 passed/1 skipped and MCP 20/20). Assertions and skip conditions were not relaxed for timing failures.
- Windows fixtures avoid the operator's real `.agents/skills` ancestor directory by using a neutral writable parent. Native baseline launches Node with the SDK JavaScript entry point, not an npm `.cmd` shim. RPC teardown requests graceful EOF first, retaining owned-process-tree termination only as fallback; deferred state reconciliation and native hard-link/file routing remain asserted.
- File-symlink security coverage is skipped only after a capability probe; directory-link coverage uses Windows junctions. POSIX mode/permission cases are explicitly platform-gated.
- Adapter: 7/7 tests passed against the integrated forks, then 7/7 passed again using actual Pi 1.2 host peer aliases and native loader identity (bg-53). Local and actual-host typechecks, `verify:compatibility`, package dry-run and diff checks passed (bg-52). `package.json`, `compatibility.json` and submodule revisions pin the integrated pair by exact commit. The enclosing repository originally had no package lockfile; none was fabricated for remotely unavailable commits. The profile-switch dependency lockfile was regenerated and its `npm ci --ignore-scripts` passed during integration.

### Distribution and remaining limitations

All new commits and dependency pins are local-only. Fresh remote Git/submodule installation cannot be verified until a separately authorized push makes these commits fetchable. No release tags, publication, deployment, or further installed settings changes were made. Manual TUI, exhaustive provider/remote, and clean-install matrices were not performed. The original shell-less worker-tool report remains unexplained; verification did not widen worker permissions.

One empty permission-probe directory remains at `C:/WINDOWS/Temp/pi-profile-isolation-probe-9479effd-8b71-487c-b82f-b2d351d13b4f`: creation succeeded but ordinary deletion, including `-Force`, was denied. No elevation or ACL changes were attempted. It is not used by the tests.
