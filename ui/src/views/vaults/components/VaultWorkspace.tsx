import { useEffect, useRef, useState, useCallback, type DragEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "../../../components/Icon";
import { GraphPage } from "../pages/GraphPage";
import { NotePage } from "../pages/NotePage";
import { VaultTablePage } from "../pages/VaultTablePage";
import type { VaultWorkspaceLayout, VaultWorkspaceState, WorkspaceTab } from "../vaultWorkspace";
import { VAULT_NOTE_DRAG_TYPE, VAULT_TAB_DRAG_TYPE, readDragData, type VaultNoteDragData, type VaultTabDragData } from "../vaultDrag";

export type VaultTabMenuAction = "close" | "closeOthers" | "closeRight" | "closeAll";

interface TabMenuState {
  paneId: string;
  tabId: string;
  x: number;
  y: number;
}

function clampTabMenuPosition(x: number, y: number): Pick<TabMenuState, "x" | "y"> {
  return {
    x: Math.max(8, Math.min(x, window.innerWidth - 188)),
    y: Math.max(8, Math.min(y, window.innerHeight - 158)),
  };
}

export function VaultWorkspace({
  vaultId,
  state,
  onActivatePane,
  onActivateTab,
  onCloseTab,
  onMoveTab,
  onDropNote,
  onTabMenuAction,
  onOpenNote,
  onLayout,
}: {
  vaultId: string;
  state: VaultWorkspaceState;
  onActivatePane: (paneId: string) => void;
  onActivateTab: (paneId: string, tab: WorkspaceTab) => void;
  onCloseTab: (paneId: string, tabId: string) => void;
  onMoveTab?: (sourcePaneId: string, tabId: string, targetPaneId: string, targetIndex: number) => void;
  onDropNote?: (paneId: string, path: string, title: string, targetIndex: number) => void;
  onTabMenuAction?: (paneId: string, tabId: string, action: VaultTabMenuAction) => void;
  onOpenNote: (path: string, title?: string) => void;
  onLayout: (layout: VaultWorkspaceLayout) => void;
}) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [columnSplit, setColumnSplit] = useState(50);
  const [rowSplit, setRowSplit] = useState(50);
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(() => new Set());
  const [dropTarget, setDropTarget] = useState<{ paneId: string; index: number } | null>(null);
  const [tabMenu, setTabMenu] = useState<TabMenuState | null>(null);
  // Per-tab editor mode — key is `${paneId}:${tabId}`, value is "source" or "rich".
  // We only store "source" overrides; absence means "rich" (the default).
  const [tabModes, setTabModes] = useState<Map<string, "rich" | "source">>(() => new Map());

  const handleEditorModeChange = useCallback((paneId: string, tabId: string, mode: "rich" | "source") => {
    setTabModes((current) => {
      const next = new Map(current);
      if (mode === "rich") next.delete(`${paneId}:${tabId}`);
      else next.set(`${paneId}:${tabId}`, mode);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!tabMenu) return;
    const close = () => setTabMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [tabMenu]);

  const closeTab = (paneId: string, tabId: string) => {
    if (dirtyTabs.has(`${paneId}:${tabId}`) && !window.confirm("Discard unsaved changes and close this tab?")) return;
    onCloseTab(paneId, tabId);
  };

  const runTabMenuAction = (paneId: string, tabId: string, action: VaultTabMenuAction) => {
    if (action === "close") {
      closeTab(paneId, tabId);
      return;
    }
    const pane = state.panes.find((candidate) => candidate.id === paneId);
    const tabIndex = pane?.tabs.findIndex((tab) => tab.id === tabId) ?? -1;
    const closingTabs = pane?.tabs.filter((tab, index) => {
      if (action === "closeOthers") return tab.id !== tabId;
      if (action === "closeRight") return index > tabIndex;
      return true;
    }) ?? [];
    const discardsDraft = closingTabs.some((tab) => dirtyTabs.has(`${paneId}:${tab.id}`));
    if (discardsDraft && !window.confirm("Discard unsaved changes in the tabs being closed?")) return;
    onTabMenuAction?.(paneId, tabId, action);
  };

  const dropAt = (paneId: string, index: number) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const tab = readDragData<VaultTabDragData>(event.dataTransfer, VAULT_TAB_DRAG_TYPE);
    if (tab?.paneId && tab.tabId) {
      onMoveTab?.(tab.paneId, tab.tabId, paneId, index);
    } else {
      const note = readDragData<VaultNoteDragData>(event.dataTransfer, VAULT_NOTE_DRAG_TYPE);
      if (note?.path && note.title) onDropNote?.(paneId, note.path, note.title, index);
    }
    setDropTarget(null);
  };

  const dragOverAt = (paneId: string, index: number) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = event.dataTransfer.getData(VAULT_TAB_DRAG_TYPE) ? "move" : "copy";
    setDropTarget({ paneId, index });
  };

  const hasColumnSplit = state.layout === "columns" || state.layout === "grid";
  const hasRowSplit = state.layout === "rows" || state.layout === "grid";

  const beginResize = (axis: "x" | "y") => (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const onMove = (moveEvent: MouseEvent) => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const raw = axis === "x"
        ? ((moveEvent.clientX - rect.left) / rect.width) * 100
        : ((moveEvent.clientY - rect.top) / rect.height) * 100;
      const next = Math.max(20, Math.min(80, Math.round(raw)));
      if (axis === "x") setColumnSplit(next);
      else setRowSplit(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const resizeWithKeyboard = (axis: "x" | "y") => (event: KeyboardEvent<HTMLDivElement>) => {
    const backward = axis === "x" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const forward = axis === "x" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!backward && !forward) return;
    event.preventDefault();
    const update = (current: number) => Math.max(20, Math.min(80, current + (forward ? 5 : -5)));
    if (axis === "x") setColumnSplit(update);
    else setRowSplit(update);
  };

  const workspaceStyle = {
    ...(hasColumnSplit ? { gridTemplateColumns: `calc(${columnSplit}% - 0.5px) calc(${100 - columnSplit}% - 0.5px)` } : {}),
    ...(hasRowSplit ? { gridTemplateRows: `calc(${rowSplit}% - 0.5px) calc(${100 - rowSplit}% - 0.5px)` } : {}),
  };

  return (
    <div className="vault-workspace-shell">
      <div ref={workspaceRef} className={`vault-workspace vault-layout-${state.layout}`} style={workspaceStyle}>
        {state.panes.map((pane) => {
          const activePane = pane.id === state.activePaneId;
          return (
            <section key={pane.id} className={`vault-pane ${activePane ? "active" : ""}`} onMouseDown={() => onActivatePane(pane.id)}>
              <div className="vault-pane-header">
                <div
                  className={`vault-tabs ${dropTarget?.paneId === pane.id && dropTarget.index === pane.tabs.length ? "drop-end" : ""}`}
                  role="tablist"
                  aria-label="Open vault tabs"
                  onDragOver={dragOverAt(pane.id, pane.tabs.length)}
                  onDrop={dropAt(pane.id, pane.tabs.length)}
                >
                  {pane.tabs.map((tab, tabIndex) => {
                    const dirty = dirtyTabs.has(`${pane.id}:${tab.id}`);
                    return (
                    <div
                      key={tab.id}
                      className={`vault-tab ${tab.id === pane.activeTabId ? "on" : ""} ${dropTarget?.paneId === pane.id && dropTarget.index === tabIndex ? "drop-before" : ""} ${dropTarget?.paneId === pane.id && dropTarget.index === tabIndex + 1 ? "drop-after" : ""}`}
                      draggable={!dirty}
                      title={dirty ? "Save before moving this tab" : tab.path}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(VAULT_TAB_DRAG_TYPE, JSON.stringify({ paneId: pane.id, tabId: tab.id }));
                      }}
                      onDragOver={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        dragOverAt(pane.id, event.clientX < rect.left + rect.width / 2 ? tabIndex : tabIndex + 1)(event);
                      }}
                      onDrop={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        dropAt(pane.id, event.clientX < rect.left + rect.width / 2 ? tabIndex : tabIndex + 1)(event);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setTabMenu({ paneId: pane.id, tabId: tab.id, ...clampTabMenuPosition(event.clientX, event.clientY) });
                      }}
                      onAuxClick={(event) => { if (event.button === 1) closeTab(pane.id, tab.id); }}
                    >
                      <button type="button" role="tab" aria-selected={tab.id === pane.activeTabId} onClick={() => onActivateTab(pane.id, tab)}>
                        <Icon name={tab.kind === "note" ? "file" : tab.kind === "graph" ? "workflow" : "layout-grid"} size={12} />
                        <span>{tab.title}{dirty ? " *" : ""}</span>
                      </button>
                      <button type="button" className="vault-tab-close" aria-label={`Close ${tab.title}`} onClick={() => closeTab(pane.id, tab.id)}><Icon name="x" size={10} /></button>
                    </div>
                    );
                  })}
                </div>
                {activePane && (
                  <div className="vault-layout-actions" role="group" aria-label="Workspace layout">
                    <LayoutButton label="Single pane" layout="single" active={state.layout === "single"} onLayout={onLayout} icon="panel-right" />
                    <LayoutButton label="Split right" layout="columns" active={state.layout === "columns"} onLayout={onLayout} icon="panel-left" />
                    <LayoutButton label="Split down" layout="rows" active={state.layout === "rows"} onLayout={onLayout} icon="panel-bottom" />
                    <LayoutButton label="Grid" layout="grid" active={state.layout === "grid"} onLayout={onLayout} icon="layout-grid" />
                  </div>
                )}
              </div>
              <div className="vault-pane-content">
                {pane.tabs.length > 0 ? pane.tabs.map((tab) => (
                  <div key={tab.id} className={`vault-tab-panel ${tab.id === pane.activeTabId ? "active" : ""}`} role="tabpanel" hidden={tab.id !== pane.activeTabId}>
                    <TabContent
                    vaultId={vaultId}
                    tab={tab}
                    onOpenNote={onOpenNote}
                    onDirtyChange={(dirty) => {
                      const key = `${pane.id}:${tab.id}`;
                      setDirtyTabs((current) => {
                        const next = new Set(current);
                        if (dirty) next.add(key);
                        else next.delete(key);
                        return next;
                      });
                    }}
                    editorMode={tabModes.get(`${pane.id}:${tab.id}`)}
                    onEditorModeChange={(mode) => handleEditorModeChange(pane.id, tab.id, mode)}
                  />
                  </div>
                )) : (
                  <div className="empty-state vault-pane-empty"><div className="empty-state-icon"><Icon name="plus" size={28} /></div><div className="empty-state-title">Empty pane</div><div className="empty-state-msg">Open a file or view from the sidebar.</div></div>
                )}
              </div>
            </section>
          );
        })}
        {hasColumnSplit && (
          <div
            className="vault-pane-resizer vault-pane-resizer-x"
            style={{ left: `${columnSplit}%` }}
            role="separator"
            aria-label="Resize editor columns"
            aria-orientation="vertical"
            aria-valuenow={columnSplit}
            tabIndex={0}
            onMouseDown={beginResize("x")}
            onKeyDown={resizeWithKeyboard("x")}
          />
        )}
        {hasRowSplit && (
          <div
            className="vault-pane-resizer vault-pane-resizer-y"
            style={{ top: `${rowSplit}%` }}
            role="separator"
            aria-label="Resize editor rows"
            aria-orientation="horizontal"
            aria-valuenow={rowSplit}
            tabIndex={0}
            onMouseDown={beginResize("y")}
            onKeyDown={resizeWithKeyboard("y")}
          />
        )}
      </div>
      {tabMenu && (
        <div className="menu on vault-tab-menu" role="menu" style={{ left: tabMenu.x, top: tabMenu.y }} onClick={(event) => event.stopPropagation()}>
          {([ ["close", "Close"], ["closeOthers", "Close Others"], ["closeRight", "Close to the Right"], ["closeAll", "Close All"] ] as const).map(([action, label]) => (
            <button key={action} type="button" className="mi" role="menuitem" onClick={() => {
              runTabMenuAction(tabMenu.paneId, tabMenu.tabId, action);
              setTabMenu(null);
            }}>{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function TabContent({ vaultId, tab, onOpenNote, onDirtyChange, editorMode, onEditorModeChange }: { vaultId: string; tab: WorkspaceTab; onOpenNote: (path: string, title?: string) => void; onDirtyChange: (dirty: boolean) => void; editorMode?: "rich" | "source"; onEditorModeChange?: (mode: "rich" | "source") => void }) {
  if (tab.kind === "graph") return <GraphPage vaultId={vaultId} onOpenNote={onOpenNote} />;
  if (tab.kind === "table") return <VaultTablePage vaultId={vaultId} onOpenNote={onOpenNote} />;
  return <NotePage vaultId={vaultId} notePath={tab.path ?? null} onNavigateNote={onOpenNote} onDirtyChange={onDirtyChange} editorMode={editorMode} onEditorModeChange={onEditorModeChange} />;
}

function LayoutButton({ label, layout, active, onLayout, icon }: { label: string; layout: VaultWorkspaceLayout; active: boolean; onLayout: (layout: VaultWorkspaceLayout) => void; icon: "panel-right" | "panel-left" | "panel-bottom" | "layout-grid" }) {
  return <button type="button" className={active ? "on" : ""} aria-label={label} title={label} onClick={() => onLayout(layout)}><Icon name={icon} size={13} /></button>;
}
