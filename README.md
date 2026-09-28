# pi-profile-subagents-adapter (prototype)

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

A future published package could be loaded explicitly as a Pi extension. This
prototype is local and private; it has not been installed or published.

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
import { installPiProfileSubagentsAdapter } from "pi-profile-subagents-adapter";

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

## Prototype dependencies

The prototype uses:

- `pi-profile-switch/src/child-profile-resolver.ts`
- `pi-subagents/child-profiles`

Before publication, `pi-profile-switch` should export a stable
`pi-profile-switch/child-profiles` subpath. The adapter should then stop using
the source-path import. See [DESIGN.md](./DESIGN.md).

## Verification

```bash
npm run check
npm test
```

The local test suite covers concurrent resolution, parent-state immutability,
per-cwd project trust, persisted trust, reference-counted lifecycle, conflicting
configuration, extension shutdown, unknown profiles, and unsafe configuration.
