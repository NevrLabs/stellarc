# ADR 0004: Tunnel

Status: accepted (2026-08-26) · Supersedes the v1 ADR lineage for this domain.

## Decision

The tunnel is a **standalone Rust library + binary**, not an arclet module:
capability-scoped exposure of a single harness endpoint over iroh, usable
without the rest of stellarc (the standalone product wedge), and later mounted
by arclet as its transport layer.

Constraints from doctrine:
- Transport only — carries bytes between authorized principals; all
  authorization decisions stay at the CP chokepoint (D11/D14). The tunnel
  never gets its own permission model beyond scoped connection tickets.
- Cross-node reach through the tunnel is CP-authorized (D14); same-node
  loopback is not its concern.
- E2E encryption via iroh; discovery via the self-hosted iroh-dns zone (0002).
- Relay fallback stays a dumb pipe (paseo/comet receipts: relays that parse
  state die).

## Context

Ticket #5 (topology) + #13 (tunnel MVP is the transport spike). Field
receipts in `docs/steal-reject-matrix.md` §transit.
