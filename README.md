# stellarc

The k8s of harnesses: a harness-agnostic, inert control plane for AI coding
agents. Stellarc commands harnesses; intelligence stays in the harness.

**v2 ground-up rewrite in progress.** Doctrine: [docs/v2-charter.md](docs/v2-charter.md).
Founding ADRs: [docs/adrs/](docs/adrs/). v1 lives in git history and the
`replan/stellarc-groundup-rewrite` planning branch.

## Layout

- `apps/control` — Bun/TS control plane (kernel + first-party plugins)
- `apps/web` — web UI
- `crates/arclet` — Rust node daemon
- `crates/tunnel` — standalone iroh tunnel (lib + bin)
- `templates/` — seed templates (ADR 0005)
- `docs/` — charter, ADRs, design docs

## Development

```bash
bun install          # workspace deps
bun test             # TS tests
cargo test -p arclet -p tunnel
```
