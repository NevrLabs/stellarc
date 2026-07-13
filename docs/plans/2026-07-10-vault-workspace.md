# Vault workspace: Obsidian-like navigation and panes

Status: implementation
Issue: #13
Dependency: #12

## Current state

The Vault surface currently has a static `VaultsView` shell with separate VAULTS, NOTES, and VIEWS sections. Vault creation calls `window.prompt`, sends only a name, and does not render mutation errors. There is no note-creation affordance. Folder rows do not expand/collapse or open `index.md`. Graph and collection tables replace the entire route. Hall creates an unconfigured local jj repository and stores only a vault name in `.vault/metadata.json`.

## Proposed state

### Hall storage boundary

Per ADR 0016, Olympus owns the authoritative jj working copy. Optional provider-neutral `syncBindings` exchange editable history through the jj merge boundary, while separate `backupBindings` describe immutable recovery targets. GitHub is a sync adapter rather than required storage, and credentials are never persisted in portable vault metadata.

Vault list responses expose authority, synchronization, and backup summaries. A vault-wide document-index endpoint returns path, title, updated time, and parsed frontmatter without sending every Markdown body.

### Client workspace boundary

The URL continues to identify the active vault and active tab target. A local workspace reducer owns panes, tabs, active pane, and layout. It has no authority over document content. Layout options are one pane, two columns, two rows, and 2×2. Opening an already-open target activates it instead of duplicating it.

### Sidebar

The sidebar is task-oriented:

1. active Vault selector with Create Vault menu item;
2. segmented New Note action with a disabled/reserved item-type menu;
3. Graph View;
4. Table View;
5. Files explorer.

The file explorer owns expansion state. A folder click toggles expansion and opens its direct `index.md` child when present. Ellipsis and contextmenu invoke one shared action model. Initial actions are open, new note in folder, rename/delete for notes, and details for both.

### Table view

Table View is a vault-wide note index. Fixed columns are title and path; all frontmatter keys become optional sortable columns. This replaces the misleading collection picker for the primary sidebar action. Structured database/table items remain a later create-menu surface and do not get embedded into Markdown state.

## Migration

Existing schema-v1 metadata without a backend becomes an Olympus-only vault; a
GitHub backend becomes an optional GitHub synchronization binding. New vault
creation requires only a name and writes schema-v2 metadata. No existing note
bytes move. Routes remain compatible with `/vaults/:id?note=...`, `/graph`, and
`/tables` while the workspace uses them as active-target deep links.

## Verification gates

- Rust storage and route tests for schema-v2 metadata, schema-v1 compatibility,
  provider-neutral binding DTOs, and document index.
- Reducer/tree unit tests with red-green evidence.
- UI typecheck, full Vitest, production build.
- Vault Playwright coverage for configured creation, new note, folder index, menus, tabs, and layout.
- Real-browser verification in mock mode.
- React Doctor and final adversarial diff review.
