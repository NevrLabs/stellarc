import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BrandIcon, agentBrand } from "../../../components/BrandIcons";
import { useAgentCatalog, useProjects, useSessions, useVaults } from "../../../hooks/queries";
import { attachContextProject, attachSessionToProject, createSession, sendMessage } from "../../../api";
import type { AgentInfo, NodeInfo } from "../../../types";
import { Composer } from "./Composer";
import { PillPicker, type PillPickerItem } from "./PillPicker";

type AgentRow = { agent: AgentInfo; node: NodeInfo };
type ContextChoice = { projectId: string; mode: "read" | "write" };

function pairKey(row: AgentRow): string {
  return `${row.node.nodeId}\u0000${row.agent.id}`;
}

export function DraftSession({ initialProjectId = null }: { initialProjectId?: string | null }) {
  const navigate = useNavigate();
  const { data: projectData } = useProjects();
  const { data: vaultData } = useVaults();
  const { data: catalog, isLoading } = useAgentCatalog(true);
  const { data: sessionData } = useSessions({ managed: true, archived: false, limit: 50 });
  const projects = useMemo(
    () => [...(projectData?.projects ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [projectData?.projects],
  );
  const vaults = vaultData?.vaults ?? [];
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [contexts, setContexts] = useState<ContextChoice[]>([]);
  const [explicitVaults, setExplicitVaults] = useState<string[]>([]);
  const [explicitRepos, setExplicitRepos] = useState<string[]>([]);
  const [removedInherited, setRemovedInherited] = useState<Set<string>>(new Set());
  const [selectedAgent, setSelectedAgent] = useState<AgentRow | null>(null);
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo<AgentRow[]>(
    () => (catalog?.nodes ?? []).flatMap((node) => (node.agents ?? []).map((agent) => ({ agent, node }))),
    [catalog?.nodes],
  );
  useEffect(() => {
    if (selectedAgent) return;
    setSelectedAgent(
      rows.find((row) => row.node.status === "online" && row.agent.isDefault)
        ?? rows.find((row) => row.node.status === "online")
        ?? null,
    );
  }, [rows, selectedAgent]);

  const project = projects.find((item) => item.id === projectId) ?? null;
  const otherProjects = projects.filter((item) => item.id !== projectId);
  const projectItems = projects
    .filter((item) => item.id !== projectId && !contexts.some((context) => context.projectId === item.id))
    .map((item) => ({ id: item.id, label: item.name }));
  const vaultItems: PillPickerItem[] = vaults
    .filter((vault) => !explicitVaults.includes(vault.id))
    .map((vault) => ({ id: vault.id, label: vault.name }));
  const repoItems: PillPickerItem[] = projects.flatMap((owner) => owner.repos.map((repo) => ({
    id: `${owner.id}\u0000${repo}`,
    label: repo,
    detail: owner.name,
  }))).filter((repo) => !explicitRepos.includes(repo.id));

  const selectProject = (id: string | null) => {
    setProjectId(id);
    setRemovedInherited(new Set());
    setContexts((current) => current.filter((context) => context.projectId !== id));
  };

  const handleSend = async (model?: string, thinking?: string) => {
    const content = text.trim();
    if (!content || !selectedAgent || creating) return;
    setCreating(true);
    setError(null);
    setText("");
    try {
      const session = await createSession({
        agent: selectedAgent.agent.id,
        node: selectedAgent.node.nodeId,
      });
      if (projectId) await attachSessionToProject(session.id, projectId);
      for (const context of contexts) {
        await attachContextProject(session.id, context.projectId, context.mode);
      }
      // ponytail: repo/vault bindings stay visual until Hall exposes a session-binding endpoint.
      await sendMessage(session.id, content, model, thinking);
      void navigate({
        to: "/sessions/$sessionId",
        params: { sessionId: session.id },
        replace: true,
      });
    } catch (cause) {
      setText(content);
      setError(cause instanceof Error ? cause.message : "Could not create session");
      setCreating(false);
    }
  };

  const chip = (icon: string, name: string, source: string, inherited: boolean, onRemove: () => void) => (
    <span
      key={`${icon}:${name}:${source}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11,
        border: "1px solid var(--border-strong)", borderStyle: inherited ? "dashed" : "solid",
        borderRadius: 999, padding: "3px 10px", color: "var(--text)",
        background: inherited ? "none" : "var(--accent-wash)",
      }}
    >
      {icon} {name} <span style={{ fontSize: 9, color: "var(--faint)" }}>{source}</span>
      <Button type="button" aria-label={`Remove ${name}`} onClick={onRemove} style={{ color: "var(--faint)", fontSize: 10 }}>✕</Button>
    </span>
  );

  const inheritedRepo = project?.repos[0];
  const inheritedVault = project?.vaults[0];

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} data-draft-session>
      {/* Constrain all setup to composer width (--measure) */}
      <div className="draft-setup">
        <div className="draft-banner">
          <span className="draft-banner-dot" />
          new session · <span style={{ color: "var(--dim)" }}>configure below, then send</span>
        </div>

        <div className="draft-row">
          <DraftLabel>Project</DraftLabel>
          <div className="draft-project-row">
            <span className="draft-project-chip">
              ▣ {project?.name ?? "no project"}
              {project && <Button type="button" aria-label="No project" onClick={() => selectProject(null)} style={{ color: "var(--faint)", fontSize: 11 }}>✕</Button>}
            </span>
            <div className="draft-project-scroller">
              {otherProjects.map((item) => (
                <Button key={item.id} type="button" onClick={() => selectProject(item.id)} className="draft-pill">{item.name}</Button>
              ))}
              {project && <Button type="button" onClick={() => selectProject(null)} className="draft-pill" style={{ fontStyle: "italic" }}>no project</Button>}
            </div>
          </div>
        </div>

        <div className="draft-row">
          <DraftLabel>Attach</DraftLabel>
          <div className="draft-attach-row">
            <PillPicker items={projectItems} value={null} placeholder="＋ context" onSelect={(id) => setContexts((current) => [...current, { projectId: id, mode: "read" }])} />
            <PillPicker items={vaultItems} value={null} placeholder="＋ vault" onSelect={(id) => setExplicitVaults((current) => [...current, id])} />
            <PillPicker items={repoItems} value={null} placeholder="＋ repo" onSelect={(id) => setExplicitRepos((current) => [...current, id])} />
          </div>
          <div className="draft-chips">
            {inheritedRepo && !removedInherited.has(`repo:${inheritedRepo}`) && chip("⌥", inheritedRepo, "from project", true, () => setRemovedInherited((current) => new Set(current).add(`repo:${inheritedRepo}`)))}
            {inheritedVault && !removedInherited.has(`vault:${inheritedVault}`) && chip("◈", vaults.find((vault) => vault.id === inheritedVault)?.name ?? inheritedVault, "home", true, () => setRemovedInherited((current) => new Set(current).add(`vault:${inheritedVault}`)))}
            {contexts.map((context) => chip("▣", projects.find((item) => item.id === context.projectId)?.name ?? context.projectId, context.mode, false, () => setContexts((current) => current.filter((item) => item.projectId !== context.projectId))))}
            {explicitVaults.map((id) => chip("◈", vaults.find((vault) => vault.id === id)?.name ?? id, "vault", false, () => setExplicitVaults((current) => current.filter((item) => item !== id))))}
            {explicitRepos.map((id) => chip("⌥", id.split("\u0000")[1], "repo", false, () => setExplicitRepos((current) => current.filter((item) => item !== id))))}
          </div>
        </div>

        <div className="draft-row" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <DraftLabel>Agent</DraftLabel>
          <AgentSelector
            rows={rows}
            sessions={sessionData?.sessions ?? []}
            selected={selectedAgent}
            onSelect={setSelectedAgent}
            isLoading={isLoading}
          />
        </div>

        {/* Model preview — shows what will be used before send */}
        {selectedAgent && (
          <div className="draft-model-preview">
            <BrandIcon name={agentBrand(selectedAgent.agent.kind, selectedAgent.agent.provider)} size={14} />
            <span>{selectedAgent.agent.id}</span>
            <span className="draft-model-sep" />
            <span style={{ color: "var(--dim)" }}>{selectedAgent.agent.model ?? "auto"}</span>
            {(selectedAgent.agent.models?.length ?? 0) > 1 && (
              <span className="draft-model-count">{selectedAgent.agent.models!.length} models available · pick in composer</span>
            )}
          </div>
        )}

        {error && <div role="alert" style={{ color: "var(--err)", fontSize: 12 }}>{error}</div>}
      </div>

      <Composer
        text={text}
        onTextChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSend();
          }
        }}
        onSend={(model, thinking) => void handleSend(model, thinking)}
        onStop={() => {}}
        sending={creating}
        sessionModel={selectedAgent?.agent.model ?? null}
        sessionAgent={selectedAgent?.agent.id ?? null}
        sessionNode={selectedAgent?.node.nodeId ?? null}
        placeholder={`Message ${selectedAgent?.agent.id ?? "agent"}…`}
      />
    </div>
  );
}

function DraftLabel({ children }: { children: string }) {
  return <div className="draft-label">{children}</div>;
}

/**
 * One compact searchable agent selector keyed by node+agent.
 * Replaces the old Favorites/Recent/per-node wall with a single filterable list.
 * Recent pairs float to the top with a ◷ marker; offline nodes are greyed.
 */
function AgentSelector({
  rows,
  sessions,
  selected,
  onSelect,
  isLoading,
}: {
  rows: AgentRow[];
  sessions: Array<{ agent?: string | null; node?: string | null; lastActivity: number }>;
  selected: AgentRow | null;
  onSelect: (row: AgentRow) => void;
  isLoading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  // Build recent-pair set from session history (keyed by node+agent)
  const recentKeys = useMemo(() => {
    const seen = new Set<string>();
    for (const s of [...sessions].sort((a, b) => b.lastActivity - a.lastActivity)) {
      if (s.agent && s.node) seen.add(`${s.node}\u0000${s.agent}`);
    }
    return seen;
  }, [sessions]);

  const filtered = useMemo(() => {
    const available = rows.filter((r) => r.node.status === "online");
    if (!q) return available;
    return available.filter((r) =>
      `${r.agent.id} ${r.node.hostname || r.node.nodeId} ${r.agent.provider ?? ""}`.toLowerCase().includes(q),
    );
  }, [rows, q]);

  // keyboard: focus input on typing, Enter selects first match
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      const first = filtered[0];
      if (first) onSelect(first);
    }
  };

  if (isLoading) return <div style={{ padding: 12, color: "var(--dim)" }}>Loading agents…</div>;

  return (
    <div className="draft-agent-sel">
      <div className="draft-agent-search">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Search agents…"
          aria-label="Search agents"
          autoFocus
        />
        <Button
          type="button"
          className="draft-agent-toggle"
          aria-label={open ? "Collapse agent list" : "Expand agent list"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "▾" : "▸"}
        </Button>
      </div>
      {open && (
        <div className="draft-agent-list" role="listbox">
          {filtered.length === 0 && <div className="draft-agent-empty">No matching agents</div>}
          {filtered.map((row) => {
            const isSelected = selected ? pairKey(row) === pairKey(selected) : false;
            const isRecent = recentKeys.has(pairKey(row));
            return (
              <Button
                key={pairKey(row)}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={`${row.agent.id} on ${row.node.hostname || row.node.nodeId}`}
                onClick={() => onSelect(row)}
                className={`draft-agent-item${isSelected ? " on" : ""}`}
              >
                <BrandIcon name={agentBrand(row.agent.kind, row.agent.provider)} size={18} />
                <span className="draft-agent-name">{row.agent.id}</span>
                {isRecent && <span className="draft-agent-recent" title="Recently used">◷</span>}
                <span className="draft-agent-node">{row.node.hostname || row.node.nodeId}</span>
                <span className="draft-agent-model">{row.agent.model ?? "auto"}</span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
