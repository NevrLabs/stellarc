/**
 * SessionsView — the Sessions View component (owns sidebar + viewport layout).
 *
 * Architecture (per docs/plans/2026-07-03-olympus-usable-5-surfaces.md):
 *
 * The View OWNS:
 *   - left sidebar (session list + NavItems) — SessionSidebar
 *   - viewport LAYOUT (center chat + right sidebar + bottom panel)
 *   - right sidebar content — RightPanel
 *   - bottom panel content — BottomPanel
 *
 * Pages own viewport content ONLY:
 *   - ChatPage (the transcript + composer)
 *   - AgentsPage
 *   - UsagePage
 *
 * Routes (URL-persistent):
 *   /sessions          → empty pane (no session selected)
 *   /sessions/$id      → ChatPage
 *   /sessions/agents   → AgentsPage
 *   /sessions/usage    → UsagePage
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ vp-head (title · project badge · live badge · panel toggles) │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ vp-body                                                      │
 *   │   chatcol (flex:1)              │ rz-x │ rsidebar            │
 *   │     transcript                  │      │                      │
 *   │     rz-y                        │      │                      │
 *   │     bpanel                      │      │                      │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ composer (ChatPage-owned, rendered inside chatcol)           │
 *   └──────────────────────────────────────────────────────────────┘
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewDidDropEvent,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import { Icon } from "../components/Icon";
import { BrandIcon, agentBrand } from "../components/BrandIcons";
import { useSidebarMode } from "../store";
import { qk, useSession, useMessages, useAgents, useProject, useSessions } from "../hooks/queries";
import { useResizable } from "../hooks/useResizable";
import { ApiError, attachSessionToProject, saveProjectLayout } from "../api";
import { readSessionPanelState, writeSessionPanelState } from "../workbench/sessionPanelState";
import { LatestProjectLayoutWriter, ProjectLayoutJournal, stableJson } from "../workbench/projectLayoutPersistence";

import { SessionSidebar } from "./sessions/components/SessionSidebar";
import { RightPanel, type RsTab } from "./sessions/components/RightPanel";
import { BottomPanel, type BpTab } from "./sessions/components/BottomPanel";
import { ChatPage } from "./sessions/pages/ChatPage";
import { AgentsPage } from "./sessions/pages/AgentsPage";
import { UsagePage } from "./sessions/pages/UsagePage";
import { HistoryPage } from "./sessions/pages/HistoryPage";

type DockLayout = ReturnType<DockviewApi["toJSON"]>;

type ProjectLayoutWriterEvent =
  | { kind: "saved"; projectId: string; layout: DockLayout; result: unknown; revision: number }
  | { kind: "error"; projectId: string; error: unknown }
  | { kind: "idle"; projectId: string };

const projectLayoutWriterListeners = new Set<(event: ProjectLayoutWriterEvent) => void>();
let projectLayoutWriterRevision = 0;
const emitProjectLayoutWriterEvent = (event: ProjectLayoutWriterEvent) => {
  for (const listener of projectLayoutWriterListeners) listener(event);
};
const projectLayoutJournal = new ProjectLayoutJournal<DockLayout>(() => localStorage, stableJson);

// One queue per browser runtime, not per React mount. StrictMode and route
// remounts must not create independent writers that can complete out of order.
const projectLayoutWriter = new LatestProjectLayoutWriter<DockLayout>(
  async (projectId, layout) => {
    const result = await saveProjectLayout(projectId, layout);
    projectLayoutJournal.acknowledge(projectId, layout);
    emitProjectLayoutWriterEvent({
      kind: "saved",
      projectId,
      layout,
      result,
      revision: ++projectLayoutWriterRevision,
    });
    return result;
  },
  (projectId, error) => emitProjectLayoutWriterEvent({ kind: "error", projectId, error }),
  (projectId) => emitProjectLayoutWriterEvent({ kind: "idle", projectId }),
  stableJson,
);

interface SessionPanelParams {
  sessionId: string;
}

export function SessionsView({
  sessionId,
  projectId,
  page,
}: {
  sessionId: string | null;
  projectId: string | null;
  page: "chat" | "agents" | "usage" | "history" | null;
}) {
  const sidebarMode = useSidebarMode();
  const queryClient = useQueryClient();
  const apiRef = useRef<DockviewApi | null>(null);
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const restoringRef = useRef(false);
  const restoredProjectRef = useRef<string | null>(null);
  const restoredAuthorityRef = useRef<string | null>(null);
  const activeProjectRef = useRef(projectId);
  activeProjectRef.current = projectId;
  const {
    data: project,
    isSuccess: projectLoaded,
    isError: projectLoadFailed,
    error: projectLoadError,
    isFetching: projectFetching,
  } = useProject(projectId);
  const {
    data: sessionData,
    refetch: refetchSessions,
    isFetching: sessionsFetching,
    error: sessionsError,
  } = useSessions({ managed: true, archived: false });
  const projectSessionIds = React.useMemo(
    () => new Set(
      (sessionData?.sessions ?? [])
        .filter((session) => session.projectId === projectId)
        .map((session) => session.id),
    ),
    [projectId, sessionData?.sessions],
  );
  const [activeSessionId, setActiveSessionId] = useState(sessionId);
  const [openSessionIds, setOpenSessionIds] = useState<Set<string>>(() => new Set());
  const [paneMarks, setPaneMarks] = useState<Map<string, string>>(() => new Map());
  const [groupCount, setGroupCount] = useState(0);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [projectRestoreError, setProjectRestoreError] = useState<string | null>(null);
  const [membershipVerifiedProjectId, setMembershipVerifiedProjectId] = useState<string | null>(null);
  const [layoutSaveRevision, setLayoutSaveRevision] = useState(0);
  const [layoutSaveError, setLayoutSaveError] = useState<{
    projectId: string;
    message: string;
  } | null>(null);
  const projectFailureStatus = projectLoadError instanceof ApiError ? projectLoadError.status : null;
  const authoritativeProjectFailure = projectLoadFailed
    && projectFailureStatus !== null
    && projectFailureStatus >= 400
    && projectFailureStatus < 500;
  const membershipAuthorityReady = membershipVerifiedProjectId === projectId
    && !sessionsFetching
    && sessionsError == null;
  const membershipAuthorityReadyRef = useRef(false);
  membershipAuthorityReadyRef.current = membershipAuthorityReady;
  const projectPersistenceAllowedRef = useRef(false);
  projectPersistenceAllowedRef.current = !projectFetching
    && (projectLoaded || (projectLoadFailed && !authoritativeProjectFailure));

  const syncOpenSessions = useCallback((api: DockviewApi) => {
    const ids = new Set<string>();
    const marks = new Map<string, string>();
    api.groups.forEach((group, gi) => {
      for (const panel of group.panels) {
        const sid = (panel.params as SessionPanelParams | undefined)?.sessionId;
        if (sid) { ids.add(sid); marks.set(sid, `P${gi + 1}`); }
      }
    });
    setOpenSessionIds(ids);
    setPaneMarks(marks);
    setGroupCount(api.groups.length);
  }, []);

  // Bug 17: resizable panels — left sidebar, right sidebar, bottom panel
  const sidebar = useResizable({
    axis: "x", min: 160, max: 400, initial: 220,
    direction: "right", persistKey: "olympus-sidebar-w",
  });
  // Teardown fence (postmortem 0041 residual): on unmount — including React
  // StrictMode's mount→unmount→remount — dockview disposes panels ONE BY ONE,
  // and each removal fires onDidLayoutChange. Persisting those mid-teardown
  // snapshots corrupts the saved layout (progressively fewer panels, finally
  // zero). Layout-effect cleanups run BEFORE passive-effect cleanups, so we
  // snapshot the still-intact layout there and suspend all later persists.
  const persistSuspendedRef = useRef(false);
  const latestLayoutSaveRevisionRef = useRef(new Map<string, number>());
  const retriedPendingLayoutRef = useRef(new Map<string, string>());

  useEffect(() => {
    const listener = (event: ProjectLayoutWriterEvent) => {
      if (event.kind === "saved") {
        latestLayoutSaveRevisionRef.current.set(event.projectId, event.revision);
        if (activeProjectRef.current === event.projectId) {
          restoredAuthorityRef.current = `hall:${stableJson(event.layout)}`;
        }
        void queryClient.cancelQueries({ queryKey: qk.project(event.projectId) }).then(() => {
          if (latestLayoutSaveRevisionRef.current.get(event.projectId) === event.revision) {
            queryClient.setQueryData(qk.project(event.projectId), event.result);
          }
        });
        setLayoutSaveError((current) => current?.projectId === event.projectId ? null : current);
      } else if (event.kind === "error") {
        const detail = event.error instanceof Error ? `: ${event.error.message}` : "";
        setLayoutSaveError({
          projectId: event.projectId,
          message: `Could not save project layout${detail}`,
        });
      } else {
        if (activeProjectRef.current === event.projectId) {
          persistSuspendedRef.current = false;
        }
        setLayoutSaveRevision((revision) => revision + 1);
      }
    };
    projectLayoutWriterListeners.add(listener);
    return () => { projectLayoutWriterListeners.delete(listener); };
  }, [queryClient]);

  const persist = useCallback(() => {
    const api = apiRef.current;
    if (
      !api ||
      !projectId ||
      !projectPersistenceAllowedRef.current ||
      !membershipAuthorityReadyRef.current ||
      persistSuspendedRef.current ||
      restoringRef.current ||
      restoredProjectRef.current !== projectId
    ) return;
    const layout = JSON.parse(JSON.stringify(api.toJSON())) as DockLayout;
    projectLayoutJournal.record(projectId, layout);
    projectLayoutWriter.enqueue(projectId, layout);
  }, [projectId]);

  useLayoutEffect(() => {
    persistSuspendedRef.current = false;
    return () => {
      persist(); // final good snapshot, before dockview dispose starts
      persistSuspendedRef.current = true;
      apiRef.current = null;
    };
  }, [persist]);

  useEffect(() => {
    try { localStorage.removeItem("olympus-ui-state:sessions"); } catch { /* best effort */ }
  }, []);

  useEffect(() => setActiveSessionId(sessionId), [sessionId]);
  useEffect(() => {
    restoredProjectRef.current = null;
    restoredAuthorityRef.current = null;
    membershipAuthorityReadyRef.current = false;
    setMembershipVerifiedProjectId(null);
    setWorkspaceError(null);
    setProjectRestoreError(null);
    setOpenSessionIds(new Set());
    setPaneMarks(new Map());
    setGroupCount(0);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void refetchSessions().then((result) => {
      if (cancelled || activeProjectRef.current !== projectId) return;
      if (result.error == null && result.data) {
        membershipAuthorityReadyRef.current = true;
        setMembershipVerifiedProjectId(projectId);
      } else {
        membershipAuthorityReadyRef.current = false;
        setMembershipVerifiedProjectId(null);
        setWorkspaceError("Could not verify project membership");
      }
    }).catch(() => {
      if (!cancelled && activeProjectRef.current === projectId) {
        membershipAuthorityReadyRef.current = false;
        setMembershipVerifiedProjectId(null);
        setWorkspaceError("Could not verify project membership");
      }
    });
    return () => { cancelled = true; };
  }, [projectId, refetchSessions]);

  const openSessionPanel = useCallback((id: string, opts?: {
    drop?: DockviewDidDropEvent;
    split?: "right" | "below";
  }) => {
    const api = apiRef.current;
    if (!api) return;
    const panelId = `session:${id}`;
    const existing = api.getPanel(panelId);
    if (existing) {
      existing.api.setActive();
      setActiveSessionId(id);
      syncOpenSessions(api);
      return;
    }
    const activeGroup = api.activeGroup ?? api.groups[0] ?? null;
    const positionArgs =
      opts?.split && activeGroup
        ? { position: { referenceGroup: activeGroup, direction: opts.split === "right" ? "right" : "below" } }
        : opts?.drop?.group
          ? { position: { referenceGroup: opts.drop.group, direction: dropDirection(opts.drop.position) } }
          : {};
    const panel = api.addPanel({
      id: panelId,
      title: id,
      component: "session-panel",
      params: { sessionId: id } satisfies SessionPanelParams,
      ...positionArgs,
    });
    panel.api.setActive();
    setActiveSessionId(id);
    syncOpenSessions(api);
    requestAnimationFrame(persist);
  }, [persist, syncOpenSessions]);

  const associateAndOpenSession = useCallback(async (id: string, opts?: {
    drop?: DockviewDidDropEvent;
    split?: "right" | "below";
  }) => {
    if (!projectId) return;
    if (!projectLoaded || projectFetching || project?.id !== projectId) {
      throw new Error("Project is unavailable; session was not opened");
    }
    if (!membershipAuthorityReadyRef.current) {
      throw new Error("Project membership is unavailable; session was not opened");
    }
    if (projectSessionIds.has(id)) {
      setWorkspaceError(null);
      openSessionPanel(id, opts);
      return;
    }
    await attachSessionToProject(id, projectId);
    const refreshed = await refetchSessions();
    if (activeProjectRef.current !== projectId) return;
    const attached = refreshed.data?.sessions.some(
      (session) => session.id === id && session.projectId === projectId,
    );
    if (refreshed.error != null || !attached) {
      membershipAuthorityReadyRef.current = false;
      setMembershipVerifiedProjectId(null);
      throw new Error("Could not verify project membership; session was not opened");
    }
    membershipAuthorityReadyRef.current = true;
    setWorkspaceError(null);
    openSessionPanel(id, opts);
  }, [openSessionPanel, project?.id, projectFetching, projectId, projectLoaded, projectSessionIds, refetchSessions]);

  const openSession = useCallback(async (id: string, split?: "right" | "below") => {
    await associateAndOpenSession(id, { split });
  }, [associateAndOpenSession]);

  const handleReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    setDockApi(event.api);
    syncOpenSessions(event.api);
    event.api.onDidLayoutChange(() => { syncOpenSessions(event.api); persist(); });
    event.api.onDidActivePanelChange(({ panel }) => {
      const params = panel?.params as SessionPanelParams | undefined;
      if (params?.sessionId) setActiveSessionId(params.sessionId);
    });
    event.api.onDidRemovePanel(() => syncOpenSessions(event.api));
    event.api.onUnhandledDragOver((dragEvent) => {
      if (hasDragType(dragEvent.nativeEvent, "application/x-olympus-session")) dragEvent.accept();
    });
    event.api.onDidDrop((dropEvent) => {
      const payload = dragPayload(dropEvent.nativeEvent, "application/x-olympus-session") as {
        sessionId?: string;
        projectId?: string | null;
      } | null;
      if (!payload?.sessionId || !projectId) return;
      void associateAndOpenSession(payload.sessionId, { drop: dropEvent }).catch((error) => {
        setWorkspaceError(error instanceof Error ? error.message : String(error));
      });
    });
  }, [associateAndOpenSession, persist, projectId, syncOpenSessions]);

  useEffect(() => {
    const api = dockApi;
    if (
      !api ||
      apiRef.current !== api ||
      !projectId ||
      projectFetching ||
      (!projectLoaded && !projectLoadFailed) ||
      projectLayoutWriter.isBusy(projectId)
    ) return;
    let layout = projectLoaded ? (project?.layout as DockLayout | null | undefined) ?? null : null;
    let authoritySignature: string;
    let recoveringPendingLayout = false;
    const pendingLayout = authoritativeProjectFailure ? null : projectLayoutJournal.pending(projectId);
    if (authoritativeProjectFailure) {
      layout = null;
      authoritySignature = `rejected:${projectFailureStatus}`;
      setProjectRestoreError(`Project unavailable (HTTP ${projectFailureStatus})`);
      projectLayoutJournal.clear(projectId);
    } else if (pendingLayout) {
      layout = pendingLayout;
      authoritySignature = `pending:${stableJson(layout)}`;
      recoveringPendingLayout = true;
      setProjectRestoreError("Workspace has unsaved changes; retrying the Hall save");
    } else if (projectLoadFailed) {
      setProjectRestoreError("Hall unavailable; using the last browser workspace copy");
      layout = projectLayoutJournal.cached(projectId);
      authoritySignature = `fallback:${stableJson(layout)}`;
    } else {
      authoritySignature = `hall:${stableJson(layout)}`;
      setProjectRestoreError(null);
      projectLayoutJournal.cacheAuthority(projectId, layout);
    }
    // Rejection and an authoritative empty layout must clear already-mounted
    // content even if the separate sessions-membership request is unavailable.
    // Membership is required only before retaining or mounting session panes.
    if (layout && Object.keys(layout.panels ?? {}).length > 0 && !membershipAuthorityReady) return;
    if (
      restoredProjectRef.current === projectId
      && restoredAuthorityRef.current === authoritySignature
    ) return;
    persistSuspendedRef.current = true;
    restoringRef.current = true;
    let layoutPruned = false;
    try {
      if (restoredProjectRef.current === projectId) {
        api.clear();
      }
      if (layout && Object.keys(layout.panels ?? {}).length > 0) {
        try {
          // Dockview normalizes the object it receives. Restore from a clone so
          // the exact journaled snapshot remains available for Hall retry and
          // acknowledgement matching.
          api.fromJSON(JSON.parse(JSON.stringify(layout)) as DockLayout);
          for (const panel of [...api.panels]) {
            const sid = (panel.params as SessionPanelParams | undefined)?.sessionId;
            if (!sid || !projectSessionIds.has(sid)) {
              api.removePanel(panel);
              layoutPruned = true;
            }
          }
          pruneEmptyGroups(api);
        } catch {
          // Replace layouts from incompatible Dockview versions with a clean one.
          api.clear();
          layoutPruned = true;
        }
      }
    } finally {
      restoringRef.current = false;
    }
    restoredProjectRef.current = projectId;
    restoredAuthorityRef.current = authoritySignature;
    syncOpenSessions(api);
    if (layoutPruned) {
      persistSuspendedRef.current = false;
      persist();
    } else if (recoveringPendingLayout && layout) {
      const pendingFingerprint = stableJson(layout);
      if (retriedPendingLayoutRef.current.get(projectId) !== pendingFingerprint) {
        retriedPendingLayoutRef.current.set(projectId, pendingFingerprint);
        projectLayoutWriter.enqueue(projectId, layout);
      }
    } else {
      projectLayoutWriter.adopt(projectId, api.toJSON());
      requestAnimationFrame(() => {
        if (activeProjectRef.current === projectId && apiRef.current === api) {
          persistSuspendedRef.current = false;
        }
      });
    }
  }, [authoritativeProjectFailure, dockApi, layoutSaveRevision, membershipAuthorityReady, persist, project?.layout, projectFetching, projectId, projectLoadError, projectLoadFailed, projectLoaded, projectSessionIds, syncOpenSessions]);

  useEffect(() => {
    const api = dockApi;
    if (
      !api ||
      apiRef.current !== api ||
      !projectId ||
      !membershipAuthorityReady ||
      restoredProjectRef.current !== projectId
    ) return;
    let pruned = false;
    restoringRef.current = true;
    try {
      for (const panel of [...api.panels]) {
        const sid = (panel.params as SessionPanelParams | undefined)?.sessionId;
        if (!sid || !projectSessionIds.has(sid)) {
          api.removePanel(panel);
          pruned = true;
        }
      }
      if (pruned) pruneEmptyGroups(api);
    } finally {
      restoringRef.current = false;
    }
    if (pruned) {
      syncOpenSessions(api);
      persist();
    }
  }, [dockApi, membershipAuthorityReady, persist, projectId, projectSessionIds, syncOpenSessions]);

  const visibleWorkspaceError = workspaceError
    ?? (layoutSaveError?.projectId === projectId ? layoutSaveError.message : null)
    ?? projectRestoreError;

  return (
    <>
      {/* ── View-owned left sidebar ─────────────────────────────── */}
      {sidebarMode !== "hidden" && (
        <SessionSidebar
          width={sidebar.size}
          mode={sidebarMode}
          activeSessionId={projectId ? activeSessionId : sessionId}
          activeProjectId={projectId}
          openSessionIds={openSessionIds}
          paneMarks={paneMarks}
          onOpenSession={projectId ? openSession : undefined}
          onResizeStart={sidebar.onResizeStart}
          onResizeKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            sidebar.setSize(Math.max(160, Math.min(400, sidebar.size + (event.key === "ArrowRight" ? 10 : -10))));
          }}
        />
      )}

      {/* ── Viewport layout ─────────────────────────────────────── */}
      <div className="viewport">
        {page === "agents" ? (
          <div className="view on" data-view="sessions" style={{ flexDirection: "column" }}>
            <AgentsPage />
          </div>
        ) : page === "usage" ? (
          <div className="view on" data-view="sessions" style={{ flexDirection: "column" }}>
            <UsagePage />
          </div>
        ) : page === "history" ? (
          <div className="view on" data-view="sessions" style={{ flexDirection: "column" }}>
            <HistoryPage />
          </div>
        ) : projectId ? (
          <div
            className="sessions-dock-shell"
            data-project-ready={projectLoaded && !projectFetching && project?.id === projectId && membershipAuthorityReady}
            data-layout-saving={projectLayoutWriter.isBusy(projectId)}
          >
            {visibleWorkspaceError && (
              <div role="alert" style={{ position: "absolute", zIndex: 20, top: 8, left: "50%", transform: "translateX(-50%)", padding: "6px 10px", border: "1px solid var(--err-line)", borderRadius: 4, background: "var(--bg-elev)", color: "var(--err)", fontSize: 12 }}>
                {visibleWorkspaceError}
              </div>
            )}
            <DockviewReact
              key={projectId}
              className={`dockview-theme-abyss olympus-dockview sessions-dockview${groupCount > 1 ? " multi-group" : ""}`}
              components={{ "session-panel": SessionDockPanel }}
              onReady={handleReady}
            />
            {openSessionIds.size === 0 && <div className="sessions-dock-empty"><SessionEmptyPane /></div>}
          </div>
        ) : sessionId ? (
          <SessionPanel sessionId={sessionId} />
        ) : (
          <div className="view on" data-view="sessions"><SessionEmptyPane /></div>
        )}
      </div>
    </>
  );
}

/** Remove groups restored without any panel — they render as dead watermark
 * panes. A layout can carry them when it was serialized mid-teardown by an
 * older build, or when a panel fails to rehydrate. */
function pruneEmptyGroups(api: DockviewApi) {
  for (const group of [...api.groups]) {
    if (group.panels.length === 0) api.removeGroup(group);
  }
}

function dropDirection(position: "top" | "bottom" | "left" | "right" | "center"): "left" | "right" | "above" | "below" | "within" {
  return position === "top" ? "above" : position === "bottom" ? "below" : position === "center" ? "within" : position;
}

function hasDragType(event: globalThis.DragEvent | PointerEvent, type: string): boolean {
  return event instanceof globalThis.DragEvent && event.dataTransfer?.types.includes(type) === true;
}

function dragPayload(event: globalThis.DragEvent | PointerEvent, type: string): unknown | null {
  if (!(event instanceof globalThis.DragEvent)) return null;
  try {
    const value = event.dataTransfer?.getData(type);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function SessionDockPanel({ params }: IDockviewPanelProps<SessionPanelParams>) {
  return <SessionPanel sessionId={params.sessionId} />;
}

function SessionPanel({ sessionId }: { sessionId: string }) {
  const [rsCollapsed, setRsCollapsed] = useSessionPanelState(sessionId, "rsCollapsed", false);
  const [bpCollapsed, setBpCollapsed] = useSessionPanelState(sessionId, "bpCollapsed", false);
  const [rsTab, setRsTab] = useSessionPanelState<RsTab>(sessionId, "rsTab", "overview");
  const [bpTab, setBpTab] = useSessionPanelState<BpTab>(sessionId, "bpTab", "terminal");
  const rightPanel = useResizable({
    axis: "x", min: 200, max: 450, initial: 279,
    direction: "left", persistKey: `olympus-session-${sessionId}-rsidebar-w`,
  });
  const bottomPanel = useResizable({
    axis: "y", min: 80, max: 400, initial: 152,
    direction: "down", persistKey: `olympus-session-${sessionId}-bpanel-h`,
  });

  return (
    <SessionChatLayout
      sessionId={sessionId}
      rsCollapsed={rsCollapsed}
      bpCollapsed={bpCollapsed}
      rsTab={rsTab}
      bpTab={bpTab}
      rsWidth={rightPanel.size}
      bpHeight={bottomPanel.size}
      onRsResizeStart={rightPanel.onResizeStart}
      onBpResizeStart={bottomPanel.onResizeStart}
      onToggleRs={() => setRsCollapsed((v) => !v)}
      onToggleBp={() => setBpCollapsed((v) => !v)}
      onRsTabChange={setRsTab}
      onBpTabChange={setBpTab}
      onCloseBp={() => setBpCollapsed(true)}
    />
  );
}

function useSessionPanelState<T>(sessionId: string, key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => readSessionPanelState(sessionId, key, initial));
  useEffect(() => {
    writeSessionPanelState(sessionId, key, value);
  }, [key, sessionId, value]);
  return [value, setValue];
}

/**
 * The chat viewport layout: vp-head + vp-body (chatcol + right sidebar)
 * + bottom panel. The chatcol content (transcript + composer) is Page-owned
 * (ChatPage); the surrounding layout and right/bottom panels are View-owned.
 */
function SessionChatLayout({
  sessionId,
  rsCollapsed,
  bpCollapsed,
  rsTab,
  bpTab,
  rsWidth,
  bpHeight,
  onRsResizeStart,
  onBpResizeStart,
  onToggleRs,
  onToggleBp,
  onRsTabChange,
  onBpTabChange,
  onCloseBp,
}: {
  sessionId: string;
  rsCollapsed: boolean;
  bpCollapsed: boolean;
  rsTab: RsTab;
  bpTab: BpTab;
  rsWidth: number;
  bpHeight: number;
  onRsResizeStart: (e: React.MouseEvent) => void;
  onBpResizeStart: (e: React.MouseEvent) => void;
  onToggleRs: () => void;
  onToggleBp: () => void;
  onRsTabChange: (t: RsTab) => void;
  onBpTabChange: (t: BpTab) => void;
  onCloseBp: () => void;
}) {
  const { data: session } = useSession(sessionId);
  const { data: msgData } = useMessages(sessionId);
  const { data: agentsData } = useAgents();
  const messages = msgData?.messages ?? [];
  const navigate = useNavigate();

  // Provider for the session's bound agent → logo glyph
  const sessionAgentInfo = agentsData?.agents.find(
    (a) => a.id === session?.agent,
  );
  const agentLogo = agentBrand(sessionAgentInfo?.kind, sessionAgentInfo?.provider);

  // Derived artifact list from messages
  const artifacts = React.useMemo(() => {
    const seen = new Map<string, "new" | "modified">();
    for (const m of messages) {
      if (!m.toolCalls) continue;
      for (const tc of m.toolCalls) {
        if (tc.name === "patch" || tc.name === "write_file" || tc.name === "edit_file") {
          const args = tc.args as Record<string, unknown> | null;
          const path =
            typeof args === "object" && args && typeof args.path === "string"
              ? args.path
              : null;
          if (!path) continue;
          const isNew = tc.name === "write_file" && !tc.result?.includes("@@");
          seen.set(path, isNew ? "new" : "modified");
        }
      }
    }
    return Array.from(seen.entries()).map(([path, status]) => ({ path, status }));
  }, [messages]);

  return (
    <div
      className="view on chat-view"
      data-view="sessions"
      data-session-id={sessionId}
      style={{ flexDirection: "column" }}
    >
      {/* ── vp-head ─────────────────────────────────────────────── */}
      <div className="vp-head">
        <div className="vp-left">
          <button
            type="button"
            className="icobtn"
            style={{ padding: 0 }}
            onClick={() => void navigate({ to: "/sessions" })}
            title="Back"
          >
            <Icon name="chevron-left" />
          </button>
          <span className="vp-title chat-title">{session?.title ?? "Untitled"}</span>
          {session?.agent && (
            <span className="proj-badge">
              <BrandIcon name={agentLogo} size={11} />
              {session.agent.toUpperCase()}
            </span>
          )}
        </div>
        <div className="vp-right">
          {session?.liveness === "active" && (
            <div className="live chat-live-badge">
              <span className="dot" />
              <span className="lbl">LIVE</span>
            </div>
          )}
          {session?.managed && session?.liveness !== "active" && (
            <span className="gtag ok chat-managed-badge">managed</span>
          )}
          <button
            type="button"
            className="icobtn"
            title="Toggle bottom panel"
            onClick={onToggleBp}
          >
            <Icon name="panel-bottom" size={14} />
          </button>
          <button
            type="button"
            className="icobtn"
            title="Toggle right panel"
            onClick={onToggleRs}
          >
            <Icon name="panel-right" size={14} />
          </button>
        </div>
      </div>

      {/* ── vp-body ─────────────────────────────────────────────── */}
      <div className="vp-body">
        {/* chatcol — Page content (ChatPage) + View-owned bottom panel */}
        <div className="chatcol" style={{ display: "flex", flexDirection: "column" }}>
          {/* ChatPage owns the transcript + composer */}
          <ChatPage sessionId={sessionId} />

          {/* View-owned bottom panel */}
          {!bpCollapsed && (
            <>
              <div className="rz-y" onMouseDown={onBpResizeStart} />
              <BottomPanel
                sessionId={sessionId}
                height={bpHeight}
                tab={bpTab}
                onTabChange={onBpTabChange}
                onClose={onCloseBp}
              />
            </>
          )}
        </div>

        {/* View-owned right sidebar */}
        {!rsCollapsed && (
          <>
            <div className="rz-x" onMouseDown={onRsResizeStart} />
            <RightPanel
              width={rsWidth}
              tab={rsTab}
              onTabChange={onRsTabChange}
              session={session}
              artifacts={artifacts}
              messages={messages}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Empty pane when no session is selected. */
export function SessionEmptyPane() {
  return (
    <>
      <div className="gv-head">
        <span className="gv-title">Sessions</span>
      </div>
      <div className="gv-body">
        <div className="empty-state">
          <div className="empty-state-icon">
            <Icon name="message-square" size={32} />
          </div>
          <div className="empty-state-title">Select a session</div>
          <div className="empty-state-msg">
            Choose a session from the sidebar or create a new one to start
            chatting.
          </div>
        </div>
      </div>
    </>
  );
}
