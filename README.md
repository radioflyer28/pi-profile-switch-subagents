# pi-profile-switch-subagents

A focused lifecycle bridge between `pi-profile-switch` profile resolution and
`pi-subagents` child-profile launches.

It does not parse profiles, create children, enforce capability ceilings, or
own a second profile UI. It registers the former package's resolver through the
latter package's provider API and removes that registration at session shutdown.

## Pi extension

The default extension is intentionally conservative:

- global named profiles are available;
- persisted project trust is checked separately for every target `cwd`;
- project profile files remain disabled;
- missing or incompatible resources fail in the owning packages;
- no settings, active profile, or trust state is written.

The package can be loaded explicitly as a Pi extension. The package remains private to npm, but tagged Git releases are directly installable by Pi.

Child selection stays at launch:

```js
await runs.run("review", {
  agent: "reviewer",
  profile: "pi-profile-switch:lean-review",
  task: "Review the changes."
});
```

## Programmatic API

```ts
import { installPiProfileSubagentsAdapter } from "pi-profile-switch-subagents";

const adapter = installPiProfileSubagentsAdapter({
  agentDir: "/home/me/.pi/agent",
  profilesDir: "/home/me/.pi-profile-switch/profiles",
  trust: { mode: "deny" },
});

// ...launch children through pi-subagents...
adapter.dispose();
```

Trust policies are `deny`, `persisted`, or a custom per-cwd callback carrying an
explicit semantic key. Project profiles require non-deny trust and an explicit
`allowProjectProfiles: true` opt-in.

Identical installs in one process are reference-counted. A second install using
the same provider name but different roots, trust policy, model validator, or
compatibility settings fails rather than replacing the first registration.

## Repository layout

This repository is the integration superproject while retaining independent
upstream histories:

```text
upstream/pi-profile-switch  -> radioflyer28 feature fork (submodule)
upstream/pi-subagents       -> radioflyer28 feature fork (submodule)
src/                        -> adapter package
compatibility.json          -> authoritative supported commit set
```

This local integration snapshot pins profile-switch **0.16.0** at
`786242521a44cf547a8084b239a6f169755da8b8` and subagents **0.78.0** at
`4a63a06f88c8acefa7ae6c0009c365cf045a73e1`, validated against Pi **1.2.0**.
Both merges retain the feature-fork behavior, including Windows linkless runtime,
safe npm-shim launch, strict immutable child profiles, and per-target trust.

**Local-only:** these merge commits have not been pushed or released. The new
Git dependency pins and submodule revisions cannot be fetched from the maintained
remotes until a separately authorized push. Use the existing local checkout and
workspace links below; this snapshot is not a remotely installable release.

## Development dependencies

The current implementation uses:

- `pi-profile-switch/src/child-profile-resolver.ts`
- `pi-subagents/child-profiles`

Before publication, `pi-profile-switch` should export a stable
`pi-profile-switch/child-profiles` subpath. This package should then stop using
the source-path import. See [DESIGN.md](./DESIGN.md).

## Last published Git release (not this local snapshot)

```bash
pi install git:github.com/radioflyer28/pi-subagents@v0.71.0-child-profiles.1
pi install git:github.com/radioflyer28/pi-profile-switch-subagents@v0.1.1
```

The published `v0.1.1` tag uses the older immutable fork tags shown above. The
working snapshot uses the exact commit pins in `compatibility.json`; do not use
these historical install commands as instructions to install the new snapshot.
Pi supplies its own host package at extension load time.

## Local development

The supported fork revisions are pinned as Git submodules:

```bash
git submodule update --init --recursive
npm ci --ignore-scripts --prefix upstream/pi-profile-switch
npm ci --ignore-scripts --prefix upstream/pi-subagents
npm run dev:link-local
npm run verify:compatibility
npm run check
npm test
```

The linking script targets `upstream/` by default. Set
`PI_PROFILE_WORKSPACE_ROOT` only when using an equivalent external workspace.
It replaces existing symbolic links/junctions but refuses to replace ordinary
dependency directories.

## Verification

```bash
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

The local test suite covers concurrent resolution, parent-state immutability,
per-cwd project trust, persisted trust, reference-counted lifecycle, conflicting
configuration, extension shutdown, unknown profiles, and unsafe configuration.
