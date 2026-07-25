import { useCallback, useState } from "react";
import type { Session } from "../../../types";

export const SESSION_METADATA_FIELDS = ["agent", "model", "node", "source", "messages", "tokens"] as const;
export type SessionMetadataField = typeof SESSION_METADATA_FIELDS[number];

export const DEFAULT_SESSION_METADATA_FIELDS: ReadonlySet<SessionMetadataField> = new Set(["agent", "model"]);

export function toggleSessionMetadataField(
  fields: ReadonlySet<SessionMetadataField>,
  field: SessionMetadataField,
): Set<SessionMetadataField> {
  const next = new Set(fields);
  if (next.has(field)) next.delete(field);
  else next.add(field);
  return next;
}

export function sessionMetadata(
  session: Session,
  fields: ReadonlySet<SessionMetadataField>,
): string[] {
  const values: Partial<Record<SessionMetadataField, string | null>> = {
    agent: session.agent,
    model: session.model,
    node: session.node,
    source: session.source,
    messages: `${session.messageCount} msg`,
    tokens: `${formatCompact((session.inputTokens ?? 0) + (session.outputTokens ?? 0))} tok`,
  };
  return SESSION_METADATA_FIELDS.flatMap((field) => {
    const value = fields.has(field) ? values[field] : null;
    return value ? [value] : [];
  });
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}m`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

/* ──────────────────────────────────────────────────────────────────────
   Sidebar layout preferences — collapsible sections, hidden projects.
   All persist to localStorage under a single key; the per-user ui-state
   API (lib/uiState) can mirror this later, but localStorage is the
   synchronous source of truth for the sidebar (it renders before the
   network round-trip resolves). ──────────────────────────────────── */

const PREFS_KEY = "stellarc-sidebar-prefs";

export interface SidebarPrefs {
  /** Which section headers are collapsed (hidden content). */
  collapsed: Record<string, boolean>;
  /** Project ids hidden from the sidebar by the user. */
  hiddenProjects: string[];
}

const DEFAULT_PREFS: SidebarPrefs = { collapsed: {}, hiddenProjects: [] };

export function loadSidebarPrefs(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SidebarPrefs>;
    return {
      collapsed: parsed.collapsed ?? {},
      hiddenProjects: Array.isArray(parsed.hiddenProjects) ? parsed.hiddenProjects : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function saveSidebarPrefs(prefs: SidebarPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* best effort */ }
}

/** Toggle a section's collapse state and persist. Returns the new prefs. */
export function toggleSection(prefs: SidebarPrefs, section: string): SidebarPrefs {
  const next: SidebarPrefs = {
    ...prefs,
    collapsed: { ...prefs.collapsed, [section]: !prefs.collapsed[section] },
  };
  saveSidebarPrefs(next);
  return next;
}

/** Hide a project from the sidebar. Returns the new prefs. */
export function hideProject(prefs: SidebarPrefs, projectId: string): SidebarPrefs {
  if (prefs.hiddenProjects.includes(projectId)) return prefs;
  const next = { ...prefs, hiddenProjects: [...prefs.hiddenProjects, projectId] };
  saveSidebarPrefs(next);
  return next;
}

/** Unhide a project (show it again in the sidebar). */
export function showProject(prefs: SidebarPrefs, projectId: string): SidebarPrefs {
  const next = { ...prefs, hiddenProjects: prefs.hiddenProjects.filter((id) => id !== projectId) };
  saveSidebarPrefs(next);
  return next;
}

/** React hook wrapper: holds prefs in state, auto-loads and auto-persists. */
export function useSidebarPrefs(): {
  prefs: SidebarPrefs;
  toggle: (section: string) => void;
  hideProject: (projectId: string) => void;
  showProject: (projectId: string) => void;
} {
  const [prefs, setPrefs] = useState<SidebarPrefs>(() => loadSidebarPrefs());
  const toggle = useCallback((section: string) => setPrefs((p) => toggleSection(p, section)), []);
  const hide = useCallback((projectId: string) => setPrefs((p) => hideProject(p, projectId)), []);
  const show = useCallback((projectId: string) => setPrefs((p) => showProject(p, projectId)), []);
  return { prefs, toggle, hideProject: hide, showProject: show };
}
