# Licensing

Stellarc uses a **split license**, the same shape Convex uses for its backend
and client libraries.

| Scope | License | File |
|---|---|---|
| **Core** — `apps/stellarc-api`, `apps/stellarc-worker`, `packages/sync`, and any package that implements the control plane | **FSL-1.1-Apache-2.0** (Functional Source License, Apache 2.0 Future License) | [`LICENSE.md`](./LICENSE.md) |
| **Client** — `apps/stellarc-ui`, `packages/contracts`, `packages/client`, `packages/ui`, the MCP surface schemas, and anything a third party must link against to build on Stellarc | **Apache License 2.0** | [`LICENSE-APACHE`](./LICENSE-APACHE) |

Each package declares its license in its own `package.json` `license` field.
Where a directory has no `LICENSE*` file of its own, the root `LICENSE.md`
applies.

## What FSL means in practice

You **may**: read, modify, self-host, redistribute, and use Stellarc internally
or to build your own products on top of it.

You **may not**: offer Stellarc, or a substantially similar fork of it, as a
commercial substitute for Nevrlabs' hosted Stellarc product ("Competing Use").

**Every release converts to Apache 2.0 two years after it is published.** This is
not a permanent moat; it is a head start.

## Why the split

- The core is where the operational value lives; FSL protects the hosted
  product for two years per release.
- The client boundary must be **unencumbered**. Plugins, apps, and integrations
  built on Stellarc (the D1–D5 extension model) inherit nothing from FSL. A
  third-party plugin author is under Apache 2.0 only.

## Contributions

By contributing, you agree your contribution is licensed under the license of
the package it lands in. No CLA beyond that.

## Provenance

This branch is a ground-up rewrite. Behaviour was informed by a heavily
diverged fork of Kaneo (MIT) and by Stellarc v1; **no code is carried over
from either**, so no upstream license terms attach.
