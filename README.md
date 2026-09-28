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

The package can be loaded explicitly as a Pi extension. This development
checkout remains private and has not been installed or published.

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

## Development dependencies

The current implementation uses:

- `pi-profile-switch/src/child-profile-resolver.ts`
- `pi-subagents/child-profiles`

Before publication, `pi-profile-switch` should export a stable
`pi-profile-switch/child-profiles` subpath. This package should then stop using
the source-path import. See [DESIGN.md](./DESIGN.md).

## Local development

Until the two upstream API changes are released, link this checkout to the
adjacent local prototype workspace:

```bash
npm run dev:link-local
npm run check
npm test
```

Set `PI_PROFILE_PROTOTYPE_ROOT` when the prototype workspace is elsewhere. The
linking script only replaces existing symbolic links/junctions and refuses to
replace ordinary dependency directories.

## Verification

```bash
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

The local test suite covers concurrent resolution, parent-state immutability,
per-cwd project trust, persisted trust, reference-counted lifecycle, conflicting
configuration, extension shutdown, unknown profiles, and unsafe configuration.
