# Design: focused pi-profile-switch ↔ pi-subagents adapter

Status: **draft design with a local implementation; not published or submitted upstream**

Package: `pi-profile-switch-subagents`

Current version: `0.1.1`

## 1. Decision summary

Create a small adapter package only if the two upstreams should remain
release-independent or do not want knowledge of each other's APIs. The adapter
must be a lifecycle/composition bridge, not a third profile manager.

It has exactly three responsibilities:

1. turn `pi-profile-switch`'s pure named-profile resolver into a
   `pi-subagents` `ChildProfileProvider`;
2. register that provider once per process, with deterministic conflict and
   disposal behavior;
3. supply a fail-closed, per-target-cwd project-trust decision.

Everything else stays with an owning package:

| Concern | Owner |
|---|---|
| Profile schema, catalog precedence, references, provenance, hashes | `pi-profile-switch` |
| Child creation, tools/resource loader, ceilings, lifecycle, resume | `pi-subagents` |
| Provider registration and trust-policy binding | adapter |
| Project-trust persistence | Pi |
| `/profile` inspection namespace | profile owner / future coordinated UI |

Profiles remain launch recipes. Capability ceilings remain authorization.
Process isolation remains lifecycle/resource isolation, not an OS sandbox.

## 2. Motivation

Direct cross-package integration is mechanically small, but it creates release
coordination:

- `pi-profile-switch` would need to know how and when to register with
  `pi-subagents`, or
- `pi-subagents` would need built-in knowledge of a specific profile producer.

A focused adapter allows both upstream packages to expose neutral, versioned
seams:

```text
pi-profile-switch/child-profiles
          | pure resolve(name, cwd, trust)
          v
pi-profile-switch-subagents
          | ChildProfileProvider registration
          v
pi-subagents/child-profiles
          | resolve before child creation
          v
pi-subagents child launch + enforcement
```

This package is justified only as this narrow compatibility layer. It must not
copy profile resolution, child spawning, recovery, capability policy, or UI.

## 3. Goals

- Register profile resolution before any profiled child launch.
- Leave the parent profile, settings, tools, skills, and extensions unchanged.
- Support concurrent resolution for different child profiles.
- Evaluate project trust independently for each requested child `cwd`.
- Make duplicate extension loads safe through reference counting.
- Reject conflicting same-name provider installations.
- Dispose registration when the owning Pi sessions have shut down.
- Introduce no install, network, settings-write, active-profile, or reload path.
- Preserve the fail-closed behavior and immutable contract of both upstream
  prototypes.

## 4. Non-goals

- No `/child-profile` or alternative profile namespace.
- No profile parsing, inheritance, merging, or materialization.
- No child process/session creation.
- No capability-ceiling computation.
- No resource loading or extension filtering.
- No package installation/update.
- No trust prompts or trust-store writes.
- No model/provider discovery beyond an optional caller-supplied validator.
- No sandbox claim.
- No automatic inclusion in strict child profiles.

A profiled child that must launch profiled grandchildren must explicitly load
the adapter extension in that child process. Strict profiles do not inherit it
ambiently.

## 5. Public API

```ts
type AdapterTrustPolicy =
  | { mode: "deny" }
  | { mode: "persisted" }
  | {
      mode: "custom";
      key: string;
      resolve(cwd: string): boolean | Promise<boolean>;
    };

interface PiProfileSubagentsAdapterOptions {
  agentDir: string;
  profilesDir?: string;
  providerName?: string;                  // default: pi-profile-switch
  allowProjectProfiles?: boolean;         // default: false
  trust?: AdapterTrustPolicy;             // default: deny
  validateModel?: {
    key: string;
    validate(model: ProfileModel): Promise<string | undefined>;
  };
  piVersion?: string;
}

interface PiProfileSubagentsAdapterHandle {
  readonly providerName: string;
  readonly key: string;
  readonly disposed: boolean;
  dispose(): void;
}

installPiProfileSubagentsAdapter(options): AdapterHandle
```

The `key` values on custom trust/model functions are semantic identities, not
secrets. They let a second session assert that its callback policy is equivalent
to the first. Different keys fail closed.

The package also exposes a Pi extension entrypoint. Its conservative defaults
are:

```ts
{
  agentDir: getAgentDir(),
  trust: { mode: "persisted" },
  allowProjectProfiles: false,
  piVersion: VERSION
}
```

`persisted` means exactly `new ProjectTrustStore(agentDir).get(cwd) === true`.
It does not treat ambient defaults, the parent session's current cwd, or an
unrelated trusted project as authority for another child cwd.

## 6. Lifecycle and concurrency

### Install

1. Normalize roots and names.
2. Reject `allowProjectProfiles: true` with `trust: deny`.
3. Build a deterministic registration key from roots, provider name, trust
   policy identity, model-validator identity, and Pi compatibility value.
4. If the provider name is absent, register one provider with `pi-subagents`.
5. If the same key is already installed, increment its reference count.
6. If the provider name exists with a different key, fail before replacing it.

### Resolve

For every request, including concurrent requests:

1. evaluate trust for that exact `cwd`;
2. call `resolveNamedChildProfile` with explicit roots and trust;
3. return the immutable `ResolvedChildProfileV1` unchanged;
4. let `pi-subagents` validate, apply, persist, and re-hash it.

The adapter has no active-profile field and performs no serialization. The
underlying resolver is already call-local and concurrency-safe.

### Dispose

Each handle is idempotent. Disposal decrements the process-local reference
count. The final handle invokes the `pi-subagents` unregister function. The Pi
extension binds disposal to `session_shutdown`.

A process-global symbol is used only for registration ownership/ref-counting,
not for selected profile state. This is necessary because the upstream
provider registry is process-global and multiple Pi sessions may load the same
extension module.

## 7. Trust model

Trust is the highest-risk adapter responsibility because child cwd may differ
from the parent's cwd.

Rules:

- Default programmatic policy is `deny`.
- Default extension policy accepts only an explicit persisted Pi trust decision
  for the requested cwd.
- Trust is evaluated on every resolution request.
- Project profile files need both a true per-cwd decision and
  `allowProjectProfiles: true`.
- A custom callback needs a stable semantic key; conflicting callbacks cannot
  silently replace one another.
- The adapter never writes trust state or prompts the user.
- `pi-subagents` still rejects `projectResources: allow` until its exact
  enforcement is implemented; adapter trust does not bypass that restriction.

## 8. Failure behavior

Fail before child spawn for:

- missing/empty agent or profile roots;
- unsafe project-profile configuration;
- duplicate provider name with different policy;
- unregistered/ambiguous provider;
- unknown profile or resource;
- untrusted project profile/resource;
- incompatible resolved contract/backend;
- agent or capability-ceiling conflicts;
- content drift detected by `pi-subagents` at launch/resume.

The adapter does not catch and downgrade resolver/provider errors. Diagnostics
from the owning layer remain visible.

## 9. Dependency and compatibility strategy

### Required upstream seams

`pi-subagents` already has the prototype public subpath:

```text
pi-subagents/child-profiles
```

Before publishing the adapter, `pi-profile-switch` should expose:

```text
pi-profile-switch/child-profiles
```

with the resolver and contract/model types. The current local implementation uses
`pi-profile-switch/src/child-profile-resolver.ts` because the profile package
ships `src` but has no stable exports map. This deep import is acceptable
for local proof only and is a publication blocker.

### Fork and superproject policy

- `radioflyer28/pi-profile-switch` and `radioflyer28/pi-subagents` remain normal
  GitHub forks with independent histories.
- Each fork keeps `main` aligned with its original upstream and isolates adapter
  work on one feature branch.
- This repository is the integration superproject and pins exact feature commits
  as submodules under `upstream/`.
- `compatibility.json` is checked against the submodule Git objects and package
  manifests in CI.
- Upstream rebases are performed in the fork repositories, tested there, then
  adopted here by updating the gitlink and compatibility manifest together.

### Version policy

- Pin both fork packages as immutable Git runtime dependencies for direct Pi Git installation; keep Pi itself as an optional host peer.
- The duplicated `pi-subagents` module instance is safe because the provider registry is process-global through `Symbol.for("pi-subagents.child-profile-providers.v1")`.
- Compatibility is governed by the versioned resolved contract, not package
  names alone.
- Reject unknown contract versions in `pi-subagents`.
- Test the lowest and newest supported minor versions in CI after upstream APIs
  exist.
- Release adapter changes only for seam/compatibility updates; profile features
  should not require adapter releases.

## 10. Packaging and activation

The package is both:

- a library for explicit host-controlled installation; and
- a Pi extension with a default factory.

It should be loaded explicitly by the parent. It must not modify normal
`settings.json` itself. Installation/selection remains an operator action.

The package remains `private: true` for npm publication. Local development uses dependency junctions, while tagged Git installs hydrate the exact fork dependencies declared in `package.json`. A future npm-publishable version should remove `private`, use released public subpaths, add provenance/CI, and test the packed tarball before release.

## 11. Security analysis

What the adapter improves:

- no prompt-time `/profile` switching;
- no parent/global active-profile mutation;
- no cross-cwd trust reuse;
- no silent provider replacement;
- no package installation during resolution;
- no extension execution by the resolver.

What it does not provide:

- an OS sandbox;
- signatures or trust for selected code;
- protection from a selected malicious extension;
- cold-start guarantees for shared-process session profiles;
- automatic provider availability in strict descendants;
- an extension allowlist capability ceiling (current ceiling is deny-all).

The process-global provider registry is trusted host configuration. Only trusted
extensions should install adapters.

## 12. Implementation and tests

Local repository:

```text
/home/akriz/code/pi-profile-switch-subagents/
```

Pinned fork inputs:

- `radioflyer28/pi-profile-switch` tag `v0.11.0-windows-linkless.2`, commit `091587b0eb28d6df610a3e7e495e929ad95aa91b` (pi-profile-switch 0.11.0 plus the Windows linkless runtime, safe npm-shim launch, and optional Pi host peer)
- `radioflyer28/pi-subagents` tag `v0.71.0-child-profiles.1`, commit `3306622213cbea4660688459a6ccd4e1a8758104`
- Pi 0.87.1, Node v24.14.0

Both forks are pinned under `upstream/` as Git submodules. Local `node_modules`
entries are ignored links to those submodules. `compatibility.json` repeats the
expected commits and package versions for machine verification. No dependency
is installed globally and dependency lifecycle scripts are disabled in CI.

Tests exercise:

- two concurrent profiles with distinct contracts;
- unchanged parent settings and active-profile bytes;
- unchanged `PI_OFFLINE`;
- custom trust called separately for trusted and untrusted cwd;
- persisted Pi trust lookup;
- reference-counted duplicate installs;
- conflicting configuration rejection;
- idempotent disposal and provider removal;
- Pi `session_shutdown` integration;
- unsafe project-profile configuration rejection;
- unknown-profile propagation.

Commands:

```bash
npm run check
npm test
```

Current result: typecheck passed; **7 tests passed, 0 failed**. `npm pack
--dry-run --ignore-scripts` also passed and showed only the two docs,
compatibility manifest, package manifest, and two source entrypoints in the
dry-run tarball.

Evidence logs:

- `/home/akriz/code/pi-profile-switch-subagents/artifacts/typecheck.log`
- `/home/akriz/code/pi-profile-switch-subagents/artifacts/tests.log`
- `/home/akriz/code/pi-profile-switch-subagents/artifacts/pack-dry-run.log`

These adapter tests complement—not replace—the existing `pi-subagents` real
subprocess sentinel tests and resolver/content-identity tests.

## 13. Alternatives considered

### Direct integration in both upstreams

Still the preferred outcome when maintainers accept the two neutral seams. It
has one fewer package and less activation complexity. The adapter is useful
when neither upstream should own registration policy or synchronized releases.

### Put registration in pi-profile-switch

Smaller package count, but introduces optional knowledge of `pi-subagents` and
multi-session/trust lifecycle concerns into the profile package.

### Put profile-switch support in pi-subagents

Convenient for users, but couples a general orchestrator to one profile
producer and makes future producers harder to treat neutrally.

### Shared resolver library

Not justified. Resolution remains specific to `pi-profile-switch` catalogs and
Pi resource discovery. The adapter reuses it rather than copying it.

### Broad profile-manager fork

Rejected. It duplicates ownership, increases security/release burden, and does
not improve the narrow integration seam.

## 14. Rollout plan

1. Stabilize/export `ResolvedChildProfileV1` and `resolveNamedChildProfile` from
   `pi-profile-switch/child-profiles`.
2. Stabilize the provider registry and `profile` launch field in
   `pi-subagents/child-profiles`.
3. Replace the current deep import with the public resolver subpath.
4. Run adapter unit tests plus both upstream compatibility suites.
5. Add a packed-package smoke test and exact dependency matrix.
6. Document explicit extension activation and strict-descendant behavior.
7. Publish only after independent review; do not auto-install or mutate user
   settings.

## 15. Acceptance criteria

The package is ready for publication only when:

- both public upstream subpaths are released;
- no deep imports remain;
- packed installation and extension loading are tested;
- per-cwd trust behavior is reviewed;
- process/session limitations are documented in user-facing help;
- duplicate/multi-session lifecycle tests pass;
- upstream subprocess exclusion tests remain green;
- no normal settings, active profile, or trust state is written by the adapter.
