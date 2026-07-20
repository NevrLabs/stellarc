/**
 * SessionSidebar — the View-owned left sidebar for Sessions (v4 layout).
 *
 * Top→bottom:
 *  1. + New session button (⌘N hint)
 *  2. NavItems: Agents, History, Usage (NO Sessions — the sidebar IS sessions)
 *  3. RECENT: cross-project, newest-first, 2-row entries
 *  4. PROJECTS: tree — no-project pseudo-row, project rows (N live pill),
 *     sessions nested via .tree hairline, subsessions one deeper, N more… ghost
 *
 * Sections are collapsible (click header) + vertically resizable (RECENT↔PROJECTS).
 * Collapse/hidden-projects persist to localStorage.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../../../components/Icon";
import { useProjects, useSessions, useUpdateSession } from "../../../hooks/queries";
import { useUIStore } from "../../../store";
import { attachSessionToProject, createSession } from "../../../api";
import type { Session, Project } from "../../../types";
import { timeAgo } from "../helpers";
import { AgentPicker } from "./AgentPicker";
import { useResizable } from "../../../hooks/useResizable";
import {
  DEFAULT_SESSION_METADATA_FIELDS,
  SESSION_METADATA_FIELDS,
  sessionMetadata,
  toggleSessionMetadataField,
  useSidebarPrefs,
  type SessionMetadataField,
} from "./sessionSidebarPreferences";

function isPhoneViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 820px)").matches
  );
}

export function SessionSidebar({
  width,
  activeSessionId,
  activeProjectId,
  openSessionIds = new Set(),
  paneMarks = new Map(),
  onOpenSession,
  onResizeStart,
  onResizeKeyDown,
}: {
  width: number;
  activeSessionId: string | null;
  activeProjectId?: string | null;
  openSessionIds?: ReadonlySet<string>;
  paneMarks?: ReadonlyMap<string, string>;
  onOpenSession?: (id: string, split?: "right" | "below") => void | Promise<void>;
  onResizeStart?: (e: React.MouseEvent) => void;
  onResizeKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sessionData } = useSessions({ managed: true, archived: false });
  // Cross-project: no activeProjectId filter — sidebar always shows everything.
  const sessions = sessionData?.sessions ?? [];
  const { data: projectData } = useProjects();
  const projects = projectData?.projects ?? [];
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const closeIfPhone = useCallback(() => {
    if (isPhoneViewport()) toggleSidebar();
  }, [toggleSidebar]);

  // RECENT: all managed non-archived, newest first. Cap at a reasonable number.
  const recent = useMemo(
    () => [...sessions].sort((a, b) => b.lastActivity - a.lastActivity).slice(0, 8),
    [sessions],
  );

  // PROJECTS tree: group sessions by projectId, build subsession nesting.
  const { byProject, noProject, subsessions } = useMemo(() => {
    const byProject = new Map<string, Session[]>();
    const noProject: Session[] = [];
    const subsessions = new Map<string, Session[]>(); // parentId → children
    for (const s of sessions) {
      if (s.forkType === "sub" && s.forkedFrom) {
        const children = subsessions.get(s.forkedFrom) ?? [];
        children.push(s);
        subsessions.set(s.forkedFrom, children);
      }
      if (s.projectId) {
        const list = byProject.get(s.projectId) ?? [];
        list.push(s);
        byProject.set(s.projectId, list);
      } else {
        noProject.push(s);
      }
    }
    return { byProject, noProject, subsessions };
  }, [sessions]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [projectActionError, setProjectActionError] = useState<string | null>(null);
  const [metadataOpen, setMetadataOpen] = useState(false);
  const [metadataFields, setMetadataFields] = useState<ReadonlySet<SessionMetadataField>>(
    () => new Set(DEFAULT_SESSION_METADATA_FIELDS),
  );

  const { prefs, toggle, hideProject, showProject } = useSidebarPrefs();

  // Vertical resize between RECENT and PROJECTS sections.
  const recentResize = useResizable({
    axis: "y", min: 80, max: 500, initial: 200, direction: "down",
    persistKey: "olympus-sidebar-recent-h",
  });

  const handleNewSession = useCallback(() => {
    setPickerError(null);
    setPickerOpen(true);
  }, []);

  const handlePickAgent = useCallback(
    async (agentId: string, nodeId: string) => {
      setPickerError(null);
      try {
        const session = await createSession({ agent: agentId, node: nodeId });
        setPickerOpen(false);
        if (session?.id) {
          if (activeProjectId && onOpenSession) {
            await onOpenSession(session.id);
          } else {
            void navigate({ to: "/sessions/$sessionId", params: { sessionId: session.id } });
          }
        }
      } catch (error) {
        setPickerOpen(true);
        setPickerError(error instanceof Error ? error.message : `Could not create session on ${nodeId}`);
      }
    },
    [activeProjectId, navigate, onOpenSession],
  );

  const handleOpenSession = useCallback(
    (id: string, split?: "right" | "below") => {
      setProjectActionError(null);
      if (onOpenSession) {
        void Promise.resolve(onOpenSession(id, split)).catch((error) => {
          const detail = error instanceof Error ? `: ${error.message}` : "";
          setProjectActionError(`Could not open session${detail}`);
        });
      } else {
        void navigate({ to: "/sessions/$sessionId", params: { sessionId: id } });
      }
      closeIfPhone();
    },
    [navigate, closeIfPhone, onOpenSession],
  );

  const handleSelectSession = useCallback(
    (id: string) => handleOpenSession(id),
    [handleOpenSession],
  );

  const handleProjectDrop = useCallback(async (event: React.DragEvent, projectId: string) => {
    event.preventDefault();
    const sessionId = sessionDragId(event.dataTransfer);
    if (!sessionId) return;
    setProjectActionError(null);
    try {
      await attachSessionToProject(sessionId, projectId);
      await queryClient.invalidateQueries({ queryKey: ["sessions"] });
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : "";
      setProjectActionError(`Could not move session to project${detail}`);
    }
  }, [queryClient]);

  const recentCollapsed = prefs.collapsed.recent;
  const projectsCollapsed = prefs.collapsed.projects;
  const visibleProjects = projects.filter((p) => !prefs.hiddenProjects.includes(p.id));

  return (
    <>
      <aside className="sidebar" style={{ width }}>
        <div className="sb-pad">
          <div className="session-sidebar-primary">
            <button type="button" className="newbtn" onClick={handleNewSession}>
              <Icon name="plus" size={14} />
              New session
              <span className="kbd" style={{ marginLeft: "auto" }}>⌘N</span>
            </button>
            <button type="button" className="icobtn" aria-label="Configure session row metadata" aria-expanded={metadataOpen} onClick={() => setMetadataOpen((open) => !open)}>
              <Icon name="settings-2" size={13} />
            </button>
          </div>
          {metadataOpen && (
            <div className="session-metadata-menu" role="group" aria-label="Session row metadata">
              {SESSION_METADATA_FIELDS.map((field) => (
                <label key={field}>
                  <input type="checkbox" checked={metadataFields.has(field)} onChange={() => setMetadataFields((current) => toggleSessionMetadataField(current, field))} />
                  <span>{field}</span>
                </label>
              ))}
            </div>
          )}
          <NavItem label="Agents" icon="bot" path="/sessions/agents" />
          <NavItem label="History" icon="clock" path="/sessions/history" />
          <NavItem label="Usage" icon="activity" path="/sessions/usage" />
        </div>
        <div className="sb-scroll sb-scroll-v4">
          {projectActionError && (
            <div role="alert" style={{ padding: "4px 8px", color: "var(--err)", fontSize: 12 }}>
              {projectActionError}
            </div>
          )}

          {/* ── RECENT ── */}
          <SectionHeader
            label="RECENT"
            count={recent.length}
            collapsed={recentCollapsed}
            onToggle={() => toggle("recent")}
          />
          {!recentCollapsed && (
            <div
              className="sec-content sec-recent"
              style={recent.length > 0 ? { maxHeight: recentResize.size, overflowY: "auto" } : undefined}
            >
              {recent.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={activeSessionId === s.id}
                  open={openSessionIds.has(s.id)}
                  paneMark={paneMarks.get(s.id)}
                  metadataFields={metadataFields}
                  onSelect={handleSelectSession}
                  onOpenSession={onOpenSession ? handleOpenSession : undefined}
                  projectName={projectName(projects, s.projectId)}
                  subsessionCount={(subsessions.get(s.id) ?? []).length}
                />
              ))}
            </div>
          )}

          {/* Resize bar between RECENT and PROJECTS */}
          {!recentCollapsed && !projectsCollapsed && recent.length > 0 && (
            <div className="rz-y rz-y-section" role="separator" aria-label="Resize sections" onMouseDown={recentResize.onResizeStart} />
          )}

          {/* ── PROJECTS ── */}
          <SectionHeader
            label="PROJECTS"
            count={visibleProjects.length}
            collapsed={projectsCollapsed}
            onToggle={() => toggle("projects")}
          />
          {!projectsCollapsed && (
            <div className="sec-content sec-projects">
              {/* no-project pseudo-row */}
              {noProject.length > 0 && (
                <ProjectRow
                  project={null}
                  liveCount={countLive(noProject)}
                  sessionCount={noProject.length}
                  isActive={!activeProjectId}
                  onNavigate={() => void navigate({ to: "/sessions/history", search: { project: "none" } })}
                />
              )}

              {visibleProjects.map((project) => {
                const projectSessions = (byProject.get(project.id) ?? []).sort(
                  (a, b) => b.lastActivity - a.lastActivity,
                );
                const liveCount = countLive(projectSessions);
                const SHOWN = 5;
                const shown = projectSessions.slice(0, SHOWN);
                const remaining = projectSessions.length - SHOWN;

                return (
                  <div key={project.id} className="proj-group">
                    <ProjectRow
                      project={project}
                      liveCount={liveCount}
                      sessionCount={projectSessions.length}
                      isActive={activeProjectId === project.id}
                      onNavigate={() => void navigate({ to: "/sessions/projects/$projectId", params: { projectId: project.id } })}
                      onHide={() => hideProject(project.id)}
                      data-project-id={project.id}
                      onDragOver={(e: React.DragEvent) => e.preventDefault()}
                      onDrop={(e: React.DragEvent) => void handleProjectDrop(e, project.id)}
                    />
                    <div className="tree">
                      {shown.map((s) => (
                        <SessionTreeRow
                          key={s.id}
                          session={s}
                          active={activeSessionId === s.id}
                          open={openSessionIds.has(s.id)}
                          paneMark={paneMarks.get(s.id)}
                          metadataFields={metadataFields}
                          onSelect={handleSelectSession}
                          onOpenSession={onOpenSession ? handleOpenSession : undefined}
                          subsessions={subsessions.get(s.id) ?? []}
                          allSessions={sessions}
                          activeSessionId={activeSessionId}
                          openSessionIds={openSessionIds}
                          paneMarks={paneMarks}
                        />
                      ))}
                      {remaining > 0 && (
                        <button
                          type="button"
                          className="srow ghost-row"
                          onClick={() => void navigate({ to: "/sessions/history", search: { project: project.id } })}
                        >
                          <span className="srow-copy">
                            <span className="srow-title ghost">{remaining} more…</span>
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* hidden projects ghost row */}
              {prefs.hiddenProjects.length > 0 && (
                <button
                  type="button"
                  className="srow ghost-row"
                  onClick={() => prefs.hiddenProjects.forEach(showProject)}
                >
                  <span className="srow-copy">
                    <span className="srow-title ghost">{prefs.hiddenProjects.length} hidden…</span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
      <div className="rz-x" role="separator" aria-label="Resize sessions sidebar" aria-orientation="vertical" aria-valuemin={160} aria-valuemax={400} aria-valuenow={width} tabIndex={0} onMouseDown={onResizeStart} onKeyDown={onResizeKeyDown} />

      <AgentPicker
        open={pickerOpen}
        onSelect={handlePickAgent}
        onCancel={() => setPickerOpen(false)}
        error={pickerError}
      />
    </>
  );
}

/* ── Helpers ── */

function countLive(sessions: Session[]): number {
  return sessions.filter((s) => s.liveness === "running" || s.liveness === "input-required").length;
}

function projectName(projects: Project[], id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return projects.find((p) => p.id === id)?.name;
}

function sessionDragId(dataTransfer: DataTransfer): string | null {
  try {
    const payload = JSON.parse(dataTransfer.getData("application/x-olympus-session")) as unknown;
    if (!payload || typeof payload !== "object" || !("sessionId" in payload)) return null;
    return typeof (payload as Record<string, unknown>).sessionId === "string"
      ? (payload as Record<string, string>).sessionId
      : null;
  } catch {
    return null;
  }
}

/* ── Sub-components ── */

function SectionHeader({
  label,
  count,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="sec-head sec-head-toggle" onClick={onToggle} aria-expanded={!collapsed}>
      <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={10} />
      <span className="lbl">{label}</span>
      <span className="sp" />
      <span className="ct">{count}</span>
    </button>
  );
}

function NavItem({
  label,
  icon,
  path,
}: {
  label: string;
  icon: import("../../../components/Icon").IconName;
  path: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState().location.pathname;
  const isActive = pathname === path;

  return (
    <button
      type="button"
      className={`navitem${isActive ? " on" : ""}`}
      onClick={() => void navigate({ to: path })}
      title={label}
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </button>
  );
}

/** Project row — flat button with icon, name, N-live pill. project=null = "no project". */
function ProjectRow({
  project,
  liveCount,
  sessionCount,
  isActive,
  onNavigate,
  onHide,
  ...dropProps
}: {
  project: Project | null;
  liveCount: number;
  sessionCount: number;
  isActive: boolean;
  onNavigate: () => void;
  onHide?: () => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  const [menu, setMenu] = useState(false);

  if (!project) {
    return (
      <button
        type="button"
        className={`navitem no-project-row${isActive ? " on" : ""}`}
        onClick={onNavigate}
      >
        <span className="srow-dot done" style={{ width: 6, height: 6, background: "transparent", border: "1px solid var(--faint)" }} />
        <span style={{ fontStyle: "italic", color: "var(--faint)" }}>no project</span>
        {sessionCount > 0 && <span className="ct" style={{ marginLeft: "auto" }}>{sessionCount}</span>}
      </button>
    );
  }

  return (
    <div
      className={`navitem proj-row${isActive ? " on" : ""}`}
      onClick={onNavigate}
      {...dropProps}
    >
      <Icon name="folder" size={14} />
      <span>{project.name}</span>
      {liveCount > 0 && <span className="live-pill">{liveCount} live</span>}
      <span className="proj-actions">
        <button
          type="button"
          className="srow-act"
          title="Project menu"
          onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}
        >
          <Icon name="ellipsis" size={11} />
        </button>
      </span>
      {menu && onHide && (
        <div className="ctx-menu" style={{ position: "absolute", right: 0, top: "100%", zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="ctx-item"
            onClick={(e) => { e.stopPropagation(); setMenu(false); onHide(); }}
          >
            <Icon name="x" size={12} />
            Hide from sidebar
          </button>
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  active,
  open,
  paneMark,
  metadataFields,
  onSelect,
  onOpenSession,
  projectName,
  subsessionCount,
  indent,
}: {
  session: Session;
  active: boolean;
  open: boolean;
  paneMark?: string;
  metadataFields: ReadonlySet<SessionMetadataField>;
  onSelect: (id: string) => void;
  onOpenSession?: (id: string, split?: "right" | "below") => void;
  projectName?: string;
  subsessionCount?: number;
  indent?: number;
}) {
  const title = session.title || "Untitled";
  const time = timeAgo(session.lastActivity);
  const metadata = sessionMetadata(session, metadataFields);
  const update = useUpdateSession();

  const isRunning = session.liveness === "running" || session.liveness === "active";
  const needsInput = session.liveness === "input-required";
  const showIcon = isRunning || needsInput;

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const fireOpen = useCallback((split?: "right" | "below") => {
    setMenu(null);
    if (onOpenSession) onOpenSession(session.id, split);
    else onSelect(session.id);
  }, [onOpenSession, onSelect, session.id]);

  // Subline: project · agent · state/tokens (v4 mock row2)
  const sublineParts = [projectName, ...metadata].filter(Boolean);
  if (subsessionCount && subsessionCount > 0) sublineParts.push(`${subsessionCount} sub`);

  return (
    <div
      ref={rowRef}
      className={`srow ${active ? "on focused" : ""}`}
      style={indent ? { paddingLeft: `calc(var(--nav-pad-x) + ${indent * 16}px)` } : undefined}
      data-session-id={session.id}
      data-managed={session.managed ? "true" : "false"}
      data-pinned={session.pinned ? "true" : "false"}
      data-open={open ? "true" : "false"}
      data-focused={active ? "true" : "false"}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData(
          "application/x-olympus-session",
          JSON.stringify({ type: "session", sessionId: session.id, projectId: session.projectId, title }),
        );
      }}
      onClick={() => onSelect(session.id)}
      onContextMenu={openMenu}
    >
      <span className="srow-hovercard" role="tooltip">
        <span className="hc-row"><span className="hc-k">project</span><span className="hc-v">{projectName ?? "—"}</span></span>
        <span className="hc-row"><span className="hc-k">agent</span><span className="hc-v">{session.agent ?? "—"}</span></span>
        <span className="hc-row"><span className="hc-k">model</span><span className="hc-v">{session.model ?? "—"}</span></span>
        <span className="hc-row"><span className="hc-k">node</span><span className="hc-v">{session.node ?? "olympus"}</span></span>
        {subsessionCount && subsessionCount > 0 && (
          <span className="hc-row"><span className="hc-k">subs</span><span className="hc-v">{subsessionCount}</span></span>
        )}
      </span>
      {showIcon && (
        <span className="srow-icon">
          {isRunning ? (
            <span className="srow-spinner" />
          ) : (
            <span className="srow-dot needs-input" title="Waiting for your input" />
          )}
        </span>
      )}
      <span className="srow-copy">
        <span className="srow-title">{title}</span>
        {sublineParts.length > 0 && <span className="srow-meta">{sublineParts.join(" · ")}</span>}
      </span>
      {paneMark && <span className="srow-pane-mark">{paneMark}</span>}
      <span className="srow-time">{time}</span>
      <span className="srow-actions">
        {onOpenSession && (
          <>
            <button type="button" className="srow-act" title="Open right" onClick={(e) => { e.stopPropagation(); fireOpen("right"); }}>
              <Icon name="panel-right" size={11} />
            </button>
            <button type="button" className="srow-act" title="Open below" onClick={(e) => { e.stopPropagation(); fireOpen("below"); }}>
              <Icon name="panel-bottom" size={11} />
            </button>
          </>
        )}
        <button type="button" className="srow-act" title="Open menu" onClick={openMenu}>
          <Icon name="ellipsis" size={11} />
        </button>
        <button type="button" className="srow-act" title={session.pinned ? "Unpin" : "Pin"} onClick={(e) => { e.stopPropagation(); update.mutate({ id: session.id, patch: { pinned: !session.pinned } }); }}>
          <Icon name="pin" size={11} />
        </button>
        <button type="button" className="srow-act" title="Archive" onClick={(e) => { e.stopPropagation(); update.mutate({ id: session.id, patch: { archived: true } }); }}>
          <Icon name="archive" size={11} />
        </button>
      </span>
      {menu && (
        <div
          className="ctx-menu"
          role="menu"
          style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="ctx-item" role="menuitem" onClick={() => fireOpen()}>
            <Icon name="message-square" size={12} />
            Open
          </button>
          {onOpenSession && (
            <>
              <button type="button" className="ctx-item" role="menuitem" onClick={() => fireOpen("right")}>
                <Icon name="panel-right" size={12} />
                Open Right
              </button>
              <button type="button" className="ctx-item" role="menuitem" onClick={() => fireOpen("below")}>
                <Icon name="panel-bottom" size={12} />
                Open Below
              </button>
            </>
          )}
          <div className="ctx-sep" />
          <button type="button" className="ctx-item" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenu(null); update.mutate({ id: session.id, patch: { pinned: !session.pinned } }); }}>
            <Icon name="pin" size={12} />
            {session.pinned ? "Unpin" : "Pin"}
          </button>
          <button type="button" className="ctx-item" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenu(null); navigator.clipboard?.writeText(session.id); }}>
            <Icon name="copy" size={12} />
            Copy ID
          </button>
          <button type="button" className="ctx-item" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenu(null); update.mutate({ id: session.id, patch: { archived: true } }); }}>
            <Icon name="archive" size={12} />
            Archive
          </button>
        </div>
      )}
    </div>
  );
}

/** Session row inside the PROJECTS tree — renders subsessions nested one deeper. */
function SessionTreeRow({
  session,
  active,
  open,
  paneMark,
  metadataFields,
  onSelect,
  onOpenSession,
  subsessions,
  allSessions,
  activeSessionId,
  openSessionIds,
  paneMarks,
}: {
  session: Session;
  active: boolean;
  open: boolean;
  paneMark?: string;
  metadataFields: ReadonlySet<SessionMetadataField>;
  onSelect: (id: string) => void;
  onOpenSession?: (id: string, split?: "right" | "below") => void;
  subsessions: Session[];
  allSessions: Session[];
  activeSessionId: string | null;
  openSessionIds: ReadonlySet<string>;
  paneMarks: ReadonlyMap<string, string>;
}) {
  const projectName: string | undefined = undefined; // already inside project group
  return (
    <>
      <SessionRow
        session={session}
        active={active}
        open={open}
        paneMark={paneMark}
        metadataFields={metadataFields}
        onSelect={onSelect}
        onOpenSession={onOpenSession}
        subsessionCount={subsessions.length}
      />
      {subsessions.map((sub) => (
        <SessionRow
          key={sub.id}
          session={sub}
          active={activeSessionId === sub.id}
          open={openSessionIds.has(sub.id)}
          paneMark={paneMarks.get(sub.id)}
          metadataFields={metadataFields}
          onSelect={onSelect}
          onOpenSession={onOpenSession}
          indent={1}
        />
      ))}
    </>
  );
}
