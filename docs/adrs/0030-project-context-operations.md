# ADR 0030 — Project-Context Operations and the Session Tool Surface

- Status: Accepted
- Date: 2026-07-20
- Builds on: ADR 0019 (one typed Axis operation seam; MCP/CLI/REST are thin
  adapters over it), ADR 0011 (Axis MCP server, per-session capabilities),
  ADR 0026 (project content + authority matrix), ADR 0028 (context-project
  attachments)
- Unblocks: ADR0028-TOOLS (there was no project→agent-tool seam to mirror)

## 1. Problem

ADR 0028 §2 requires context-project access to be *agent-native* (tools, not
mounts). But no project→agent tool surface exists: the primary project is only
symlinked into the session space, board/card reads are REST/UI routes, and
setup resolution passes an empty project scope (`sessions.rs` line ~1115 TODO).
This ADR defines that surface once, for the primary project, so context
projects reuse it verbatim.

## 2. Decision

Project content is reachable by agents through **typed Axis operations** (ADR
0019), exposed to sessions via the **MCP `session_tool_provider`** contribution
(ADR 0011 §3 / registry). No new protocol, no mounts, no REST-wrapping.

### 2.1 The operations (read tier — this ADR)

Namespaced `project.*`, each taking a `project_ref` (see §3):

| Operation | Returns |
|---|---|
| `project.context.list` | context/README/doc file paths in the project home vault |
| `project.context.read` | one context file's Markdown bytes |
| `project.board.list` | boards of the project |
| `project.card.list` | cards of a board (structured fields + key) |
| `project.card.read` | one card: structured fields + description Markdown |
| `project.card.comments` | a card's comment thread |

Write-tier operations (`project.card.create/edit`, `project.context.write`,
`project.card.comment`) are a later ADR; they must go through the same seam and
ADR 0026 admission (cr-sqlite for structured, signed jj for prose).

### 2.2 Adapter exposure

A built-in `session_tool_provider` (registry slug `project-context`) maps each
operation to one MCP tool. The setup adapter injects it into the session's
`.mcp.json` exactly as any other MCP server (ADR 0006 §9). CLI gets the same
operations for free (ADR 0019). Axis remains the single policy point.

## 3. Scoping and authorization — the core rule

The tool surface is bound to the **session**, and every call resolves
`project_ref` against that session's *live* graph edges (ADR 0029):

- **Primary project** — always in scope for a session that has one. Wire
  `session.project_id` into setup resolution (kills the line-1115 TODO). This
  is what makes the primary project agent-native for the first time.
- **Context projects** — each `SESSION_CONTEXT_PROJECT` edge (ADR 0028) adds
  its project to scope, tagged with its `mode`. Read operations accept any
  in-scope project (read is allowed for both `read` and `write` modes).
- **Everything else fail-closed.** A `project_ref` not equal to the primary or
  an attached context project returns a capability error — never data. No
  transitivity: an attached project's own content only, never its referenced
  repos/vaults/sessions (ADR 0028 §2).

Authorization re-checks the acting user's *current* project access on every
call (attachment rows are not a standing bypass, ADR 0028 §3). The session
capability set (ADR 0011 §4) carries the allowed `project_ref` list; Axis
recomputes it when edges or grants change.

## 4. Migration order

1. Typed `project.*` read operations on the Axis operation seam + capability
   plumbing for the allowed-project list.
2. Wire `session.project_id` into `effective_for_project` (line-1115 TODO); the
   primary project's operations become callable in-session.
3. `project-context` `session_tool_provider` mapping ops → MCP tools; adapter
   injects into `.mcp.json`.
4. Extend scope resolution to include `SESSION_CONTEXT_PROJECT` edges with mode
   (this is the ADR0028-TOOLS card, now unblocked).
5. Write-tier operations — later ADR.

## 5. Rejected

- **Wrap the existing REST/UI card routes as agent tools** — bypasses the ADR
  0019 typed-operation/capability seam; two policy paths.
- **A second MCP server per project** — ADR 0011 has one Axis MCP server;
  project scope is a call-time argument resolved against session edges, not a
  server-per-project.
- **Mount context files into the session space** — ADR 0028 §5 already rejected
  this (stale copies, non-immediate detach, no admission on writes).
