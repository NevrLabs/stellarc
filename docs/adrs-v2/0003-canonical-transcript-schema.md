# ADR 0003: Canonical transcript schema

Status: accepted (2026-08-26) · Supersedes the v1 ADR lineage for this domain.

## Decision

Full schema: [`docs/transcript-schema-v2.md`](../transcript-schema-v2.md).

- **Identity spine (D22):** session → turn → item; parts are transport-only.
  Turn-close is an explicit adapter-emitted event. Items carry optional
  causality refs — trace views are projections.
- **Raw/normalized split (D21):** normalized ACP-shaped 9-kind union plane-side;
  verbatim raw wire in the node-local journal (a node claim), with org-grantable
  async raw-retention to blob storage by reference. No inline raw JSONB.
- **Engine contract (D23):** workflows consume curated, independently versioned
  lifecycle signals; raw-union subscription is grant-gated.
- Handover is a structured replay prompt — lossy by design; native-format
  synthesis only for same-harness resume. Conformance pinned per
  (harness, version-range) with capability flags.

## Context

Ticket #8; four-harness evidence in
`~/stellarc-research/reports/transcript-formats.md` (T3). ACP types used
verbatim (Apache-2.0). Context-compression normalization parked (D21).
