import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Icon } from "../../../components/Icon";
import type { SidebarMode } from "../../../store";
import type { NoteTreeEntry, VaultSummary } from "../../../types";
import { findFolderIndex } from "../vaultWorkspace";

interface EntryMenu {
  entry: NoteTreeEntry;
  x: number;
  y: number;
  maxHeight: number;
}

export function VaultSidebar({
  vaults,
  activeVaultId,
  notes,
  activeNotePath,
  onSelectVault,
  onCreateVault,
  onCreateNote,
  onOpenNote,
  onOpenGraph,
  onOpenTable,
  onRenameNote,
  onDeleteNote,
  mode = "full",
}: {
  vaults: VaultSummary[];
  activeVaultId: string | null;
  notes: NoteTreeEntry[];
  activeNotePath: string | null;
  onSelectVault: (id: string) => void;
  onCreateVault: () => void;
  onCreateNote: (folder?: string) => void;
  onOpenNote: (path: string, title?: string) => void;
  onOpenGraph: () => void;
  onOpenTable: () => void;
  onRenameNote: (entry: NoteTreeEntry) => void;
  onDeleteNote: (entry: NoteTreeEntry) => void;
  mode?: SidebarMode;
}) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(notes.filter((entry) => entry.kind === "folder").map((entry) => entry.path)));
  const [entryMenu, setEntryMenu] = useState<EntryMenu | null>(null);
  const [details, setDetails] = useState<NoteTreeEntry | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const activeVault = vaults.find((vault) => vault.id === activeVaultId) ?? null;

  useEffect(() => {
    const close = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setVaultOpen(false);
        setCreateOpen(false);
      }
      setEntryMenu(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const toggleFolder = (entry: NoteTreeEntry) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
    const index = findFolderIndex(entry);
    if (index) onOpenNote(index.path, index.title);
  };

  const openMenu = (event: MouseEvent, entry: NoteTreeEntry) => {
    event.preventDefault();
    event.stopPropagation();
    setEntryMenu({ entry, x: event.clientX, y: event.clientY, maxHeight: Math.max(48, window.innerHeight - event.clientY - 12) });
  };

  return (
    <aside
      id="primary-sidebar"
      className={`sidebar on vault-sidebar${mode === "compact" ? " compact" : ""}`}
      style={{ width: mode === "compact" ? "var(--sidebar-compact-w)" : undefined }}
      aria-label="Vaults sidebar"
      ref={rootRef}
    >
      <div className="vault-sidebar-body">
        <div className="vault-selector-wrap">
          <button type="button" className="vault-selector" title={activeVault?.name ?? "Select a vault"} aria-label={`Vault: ${activeVault?.name ?? "Select a vault"}`} aria-haspopup="menu" aria-expanded={vaultOpen} onClick={() => setVaultOpen((value) => !value)}>
            <Icon name="book" size={15} />
            <span><small>Vault</small><strong>{activeVault?.name ?? "Select a vault"}</strong></span>
            <Icon name="chevron-down" size={12} />
          </button>
          {vaultOpen && (
            <div className="menu vault-popup" role="menu">
              {vaults.map((vault) => (
                <button key={vault.id} type="button" className={`mi ${vault.id === activeVaultId ? "on" : ""}`} role="menuitem" onClick={() => { setVaultOpen(false); onSelectVault(vault.id); }}>
                  <Icon name="book" size={13} /><span>{vault.name}</span><span className="vault-menu-count">{vault.noteCount}</span>
                </button>
              ))}
              <div className="vault-menu-divider" />
              <button type="button" className="mi" role="menuitem" onClick={() => { setVaultOpen(false); onCreateVault(); }}>
                <Icon name="plus" size={13} /><span>Create vault…</span>
              </button>
            </div>
          )}
        </div>

        <div className="vault-create-segment">
          <button type="button" className="vault-create-main" title="New Note" aria-label="New Note" disabled={!activeVaultId} onClick={() => onCreateNote()}><Icon name="plus" size={14} /><span className="sidebar-label">New Note</span></button>
          <button type="button" className="vault-create-more" aria-label="Other new item types" aria-haspopup="menu" aria-expanded={createOpen} disabled={!activeVaultId} onClick={() => setCreateOpen((value) => !value)}><Icon name="chevron-down" size={12} /></button>
          {createOpen && (
            <div className="menu vault-create-popup" role="menu">
              <button type="button" className="mi" role="menuitem" onClick={() => { setCreateOpen(false); onCreateNote(); }}><Icon name="file" size={13} />Note</button>
              {[
                ["Database", "layout-grid"],
                ["Excalidraw", "pencil"],
                ["draw.io", "workflow"],
                ["Table", "list"],
              ].map(([label, icon]) => (
                <button key={label} type="button" className="mi" role="menuitem" disabled title="Planned item type"><Icon name={icon as "layout-grid"} size={13} />{label}<span className="vault-menu-soon">soon</span></button>
              ))}
            </div>
          )}
        </div>

        <nav className="vault-primary-nav" aria-label="Vault views">
          <button type="button" className="navitem" title="Graph View" aria-label="Graph View" onClick={onOpenGraph}><Icon name="workflow" size={14} /><span className="sidebar-label">Graph View</span></button>
          <button type="button" className="navitem" title="Table View" aria-label="Table View" onClick={onOpenTable}><Icon name="layout-grid" size={14} /><span className="sidebar-label">Table View</span></button>
        </nav>

        <div className="vault-files-head"><span>Files</span><span>{activeVault?.noteCount ?? notes.length}</span></div>
        <div className="vault-file-tree" role="tree" aria-label="Vault files">
          {notes.map((entry) => (
            <FileTreeEntry
              key={entry.path}
              entry={entry}
              depth={0}
              expanded={expanded}
              activeNotePath={activeNotePath}
              onToggleFolder={toggleFolder}
              onOpenNote={onOpenNote}
              onOpenMenu={openMenu}
              compact={mode === "compact"}
            />
          ))}
        </div>
      </div>

      {entryMenu && (
        <div className="menu vault-context-menu" role="menu" aria-label="File actions" style={{ left: entryMenu.x, top: entryMenu.y, bottom: "auto", maxHeight: entryMenu.maxHeight, overflowY: "auto" }} onClick={(event) => event.stopPropagation()}>
          {entryMenu.entry.kind === "note" ? (
            <button type="button" className="mi" role="menuitem" onClick={() => { onOpenNote(entryMenu.entry.path, entryMenu.entry.title); setEntryMenu(null); }}><Icon name="file" size={13} />Open</button>
          ) : (
            <button type="button" className="mi" role="menuitem" onClick={() => { onCreateNote(entryMenu.entry.path); setEntryMenu(null); }}><Icon name="plus" size={13} />New note here</button>
          )}
          {entryMenu.entry.kind === "note" && <button type="button" className="mi" role="menuitem" onClick={() => { onRenameNote(entryMenu.entry); setEntryMenu(null); }}><Icon name="pencil" size={13} />Rename</button>}
          <button type="button" className="mi" role="menuitem" onClick={() => { setDetails(entryMenu.entry); setEntryMenu(null); }}><Icon name="settings-2" size={13} />Details</button>
          {entryMenu.entry.kind === "note" && <button type="button" className="mi danger" role="menuitem" onClick={() => { onDeleteNote(entryMenu.entry); setEntryMenu(null); }}><Icon name="trash" size={13} />Delete</button>}
        </div>
      )}

      {details && (
        <div className="ol-overlay" role="dialog" aria-modal="true" aria-label="File details" onClick={() => setDetails(null)}>
          <div className="ol-dialog vault-details" onClick={(event) => event.stopPropagation()}>
            <div className="ol-dialog-head"><div className="ol-dialog-title">Details</div><button type="button" className="ibtn" aria-label="Close" onClick={() => setDetails(null)}><Icon name="x" size={14} /></button></div>
            <div className="ol-dialog-body"><dl><dt>Type</dt><dd>{details.kind}</dd><dt>Path</dt><dd className="mono">{details.path}</dd><dt>Title</dt><dd>{details.title}</dd><dt>Modified</dt><dd>{new Date(details.updatedAt * 1000).toLocaleString()}</dd></dl></div>
          </div>
        </div>
      )}
    </aside>
  );
}

function FileTreeEntry({
  entry,
  depth,
  expanded,
  activeNotePath,
  onToggleFolder,
  onOpenNote,
  onOpenMenu,
  compact,
}: {
  entry: NoteTreeEntry;
  depth: number;
  expanded: Set<string>;
  activeNotePath: string | null;
  onToggleFolder: (entry: NoteTreeEntry) => void;
  onOpenNote: (path: string, title?: string) => void;
  onOpenMenu: (event: MouseEvent, entry: NoteTreeEntry) => void;
  compact: boolean;
}) {
  const folder = entry.kind === "folder";
  const isExpanded = folder && expanded.has(entry.path);
  return (
    <div role="treeitem" aria-expanded={folder ? isExpanded : undefined}>
      <div
        className={`vault-file-row ${!folder && activeNotePath === entry.path ? "on focused" : ""}`}
        style={{ paddingLeft: compact ? 0 : 8 + depth * 14 }}
        title={entry.title}
        data-open={!folder && activeNotePath === entry.path ? "true" : "false"}
        data-focused={!folder && activeNotePath === entry.path ? "true" : "false"}
        draggable={!folder}
        onDragStart={(event) => {
          if (folder) return;
          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData(
            "application/x-olympus-vault-note",
            JSON.stringify({ type: "vault-note", path: entry.path, title: entry.title }),
          );
        }}
        onContextMenu={(event) => onOpenMenu(event, entry)}
      >
        <button type="button" className="vault-file-open" aria-label={folder ? `${isExpanded ? "Collapse" : "Expand"} ${entry.title}` : `Open ${entry.title}`} onClick={() => folder ? onToggleFolder(entry) : onOpenNote(entry.path, entry.title)}>
          {folder && <Icon className="vault-folder-chevron" name={isExpanded ? "chevron-down" : "chevron-right"} size={11} />}
          <Icon name={folder ? "folder" : "file"} size={13} />
          <span>{folder ? entry.title : entry.path.split("/").pop()}</span>
        </button>
        <button type="button" className="vault-file-menu" aria-label={`Actions for ${entry.title}`} onClick={(event) => onOpenMenu(event, entry)}><Icon name="ellipsis" size={13} /></button>
      </div>
      {folder && isExpanded && entry.children.map((child) => (
        <FileTreeEntry key={child.path} entry={child} depth={depth + 1} expanded={expanded} activeNotePath={activeNotePath} onToggleFolder={onToggleFolder} onOpenNote={onOpenNote} onOpenMenu={onOpenMenu} compact={compact} />
      ))}
    </div>
  );
}
