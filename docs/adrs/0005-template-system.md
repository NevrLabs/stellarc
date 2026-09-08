# ADR 0005: Template system

Status: accepted (2026-08-26) · Supersedes the v1 ADR lineage for this domain.

## Decision

Full design: [`docs/template-system.md`](../template-system.md) (D24).

Templates are a first-class resource kind (first-party plugin): versioned
frozen snapshots, org-scoped, grantable. Three types — agent, project,
workflow — one mechanism; instantiation is recursive, recorded as an event
with `{templateId, version, overrides}`. No live inheritance; re-sync is
explicit diff/apply. Distribution in three tiers (org / installed-read-only /
marketplace) with git-repo-URL interchange and the D3 ratification gate on
marketplace. Four seed templates ship in v1.

## Context

Ticket #9. Precedents: team-brain 3-tier skills, multica refresh-from-source,
openship config-frozen deploys, dsh profiles→bundles.
