# ADR 0028 — Session Primary Project and Context-Project Attachments

- Status: Accepted
- Date: 2026-07-19
- Amends: ADR 0005 (session→project relation: exactly one primary project),
  ADR 0026 (a Project is now an attachable context surface for sessions)
- Relates to: ADR 0011 (agent capabilities/tools), ADR 0024 (grants),
  ADR 0027 (auth matrix, vault provenance)

## 1. Decision

- A session has **exactly one primary project** (`session.project_id`,
  nullable — projectless sessions stay valid). The primary project keeps all
  existing mechanics: home-vault symlink materialization into the session
  space, default board, context injection. Nothing changes here; this ADR
  makes the one-primary rule normative.
- A session may additionally attach any number of **context projects**:

  ```text
  SESSION_CONTEXT_PROJECT { session_id, project_id, mode: read|write,
                            attached_by, attached_at, detached_at }
  ```

  Same-org only. Event-sourced in the session event log; projected onto
  `SessionRow`. A project cannot be both primary and context of the same
  session — attach rejects it. Detach is effective for the session's next
  tool call; nothing lingers on the node.

## 2. Access surface — agent-native, tools not mounts

- A context attachment exposes the attached project's **own content**:
  context Markdown, README/docs, and its boards — cards, descriptions,
  comments — subject to each board backend's advertised capabilities
  (ADR 0026).
- **Access is through Hall APIs surfaced as agent tools** (list/read/search
  context files and cards; in `write` mode create/edit cards, comment, edit
  context Markdown). The context project's home vault is **never
  materialized** into the session space and no symlink is created — the
  primary project holds the sole file-level binding.
  - Rationale: every write remains an admitted operation under the ADR 0026
    authority matrix (structured card fields via cr-sqlite admission, prose
    via mandatory signed jj commits per ADR 0027 §6 with the agent's
    committer key); detach revokes instantly because nothing was copied.
- **No transitivity, fail-closed.** Attaching project Y grants Y's own
  content only — never Y's referenced repos/vaults/sessions and never Y's own
  attachments. Anything the tool layer cannot authorize returns a capability
  error, never partial data.

## 3. Authorization

- Attach/detach requires write access to the **session** plus at least read
  on the target project; `mode=write` additionally requires the actor to
  hold write on the target project at attach time.
- The attachment is **not a standing bypass**: every agent operation is
  re-checked at admission against the attaching user's *current* project
  access. Revoking that access invalidates the attachment's effect
  immediately; the row stays for audit.
- Attribution follows ADR 0027 §6: prose writes carry author = user on whose
  behalf, committer + signature = agent Hall-minted key; card operations
  record acting session + user in admitted operation markers.

## 4. Migration order

1. Session event variants `ContextProjectAttached` / `ContextProjectDetached`
   (append at enum end; old events unaffected).
2. `SessionRow` projection + DTO field `contextProjects: [{ projectId, mode }]`.
3. Routes: attach/detach endpoints following the existing primary-attach
   handler pattern (`routes/sessions.rs`).
4. Tool surface via the ADR 0011 capability path: read tool group first,
   write group second.
5. UI: session right panel lists context projects with mode badges; sidebar
   redesign is a separate track, out of scope here.

## 5. Rejected alternatives

- **Mount/materialize context-project vaults into the session space** —
  bypasses cr-sqlite/jj admission for writes, leaves stale copies on nodes,
  makes detach non-immediate, and multiplies sync cost per attachment.
- **Transitive access through the attached project's references** —
  privilege amplification; a read attach to Y must not leak Y's repos or
  other vaults.
- **Multiple primary projects per session** — ambiguous file-level binding
  and default-board semantics; extra projects as tool-scoped context cover
  the need without it.
