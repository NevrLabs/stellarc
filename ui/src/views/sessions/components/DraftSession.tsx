import { useEffect, useMemo, useState } from "react";
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

  const recent = useMemo(() => {
    const available = new Map(rows.map((row) => [pairKey(row), row]));
    const seen = new Set<string>();
    return [...(sessionData?.sessions ?? [])]
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .flatMap((session) => {
        if (!session.agent || !session.node) return [];
        const key = `${session.node}\u0000${session.agent}`;
        if (seen.has(key)) return [];
        seen.add(key);
        const row = available.get(key);
        return row && row.node.status === "online" ? [row] : [];
      })
      .slice(0, 5);
  }, [rows, sessionData?.sessions]);

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
      <button type="button" aria-label={`Remove ${name}`} onClick={onRemove} style={{ color: "var(--faint)", fontSize: 10 }}>✕</button>
    </span>
  );

  const inheritedRepo = project?.repos[0];
  const inheritedVault = project?.vaults[0];
  const favorites = rows.filter((row) => row.agent.isDefault && row.node.status === "online");

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }} data-draft-session>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", fontSize: 12, color: "var(--faint)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--warn)" }} />
        new session · <span style={{ color: "var(--dim)" }}>first message locks project + agent</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 16, display: "flex", flexDirection: "column", gap: 11, overflow: "hidden" }}>
        <DraftLabel>Project</DraftLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--accent-wash)", border: "1px solid var(--border-strong)", borderRadius: 999, padding: "4px 12px", fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>
            ▣ {project?.name ?? "no project"}
            {project && <button type="button" aria-label="No project" onClick={() => selectProject(null)} style={{ color: "var(--faint)", fontSize: 11 }}>✕</button>}
          </span>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", minWidth: 0, scrollbarWidth: "none" }}>
            {otherProjects.map((item) => (
              <button key={item.id} type="button" onClick={() => selectProject(item.id)} style={pillStyle}>{item.name}</button>
            ))}
            {project && <button type="button" onClick={() => selectProject(null)} style={{ ...pillStyle, fontStyle: "italic" }}>no project</button>}
          </div>
        </div>

        <DraftLabel>Attach</DraftLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <PillPicker items={projectItems} value={null} placeholder="＋ context" onSelect={(id) => setContexts((current) => [...current, { projectId: id, mode: "read" }])} />
          <PillPicker items={vaultItems} value={null} placeholder="＋ vault" onSelect={(id) => setExplicitVaults((current) => [...current, id])} />
          <PillPicker items={repoItems} value={null} placeholder="＋ repo" onSelect={(id) => setExplicitRepos((current) => [...current, id])} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", minHeight: 23 }}>
          {inheritedRepo && !removedInherited.has(`repo:${inheritedRepo}`) && chip("⌥", inheritedRepo, "from project", true, () => setRemovedInherited((current) => new Set(current).add(`repo:${inheritedRepo}`)))}
          {inheritedVault && !removedInherited.has(`vault:${inheritedVault}`) && chip("◈", vaults.find((vault) => vault.id === inheritedVault)?.name ?? inheritedVault, "home", true, () => setRemovedInherited((current) => new Set(current).add(`vault:${inheritedVault}`)))}
          {contexts.map((context) => chip("▣", projects.find((item) => item.id === context.projectId)?.name ?? context.projectId, context.mode, false, () => setContexts((current) => current.filter((item) => item.projectId !== context.projectId))))}
          {explicitVaults.map((id) => chip("◈", vaults.find((vault) => vault.id === id)?.name ?? id, "vault", false, () => setExplicitVaults((current) => current.filter((item) => item !== id))))}
          {explicitRepos.map((id) => chip("⌥", id.split("\u0000")[1], "repo", false, () => setExplicitRepos((current) => current.filter((item) => item !== id))))}
        </div>

        <DraftLabel>Agent</DraftLabel>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, flex: 1, minHeight: 0, overflowY: "auto", background: "var(--elev)" }}>
          {isLoading && <div style={{ padding: 12, color: "var(--dim)" }}>Loading agents…</div>}
          <AgentSection label="★ favorites" rows={favorites} selected={selectedAgent} onSelect={setSelectedAgent} />
          <AgentSection label="◷ recent" rows={recent} selected={selectedAgent} onSelect={setSelectedAgent} />
          {(catalog?.nodes ?? []).map((node) => (
            <AgentSection
              key={node.nodeId}
              label={`${node.status === "online" ? "●" : "○"} ${node.hostname || node.nodeId} · ${node.status === "online" ? `${node.agents?.length ?? 0} agents` : node.status}`}
              rows={rows.filter((row) => row.node.nodeId === node.nodeId)}
              selected={selectedAgent}
              onSelect={setSelectedAgent}
              disabled={node.status !== "online"}
            />
          ))}
        </div>
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
  return <div style={{ font: "9.5px var(--font-mono)", color: "var(--faint)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: -4 }}>{children}</div>;
}

const pillStyle = {
  border: "1px solid var(--border)", borderRadius: 999, padding: "3px 11px", fontSize: 11.5,
  color: "var(--dim)", whiteSpace: "nowrap", flexShrink: 0,
} as const;

function AgentSection({
  label,
  rows,
  selected,
  onSelect,
  disabled = false,
}: {
  label: string;
  rows: AgentRow[];
  selected: AgentRow | null;
  onSelect: (row: AgentRow) => void;
  disabled?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <div style={{ position: "sticky", top: 0, zIndex: 1, padding: "8px 12px 3px", background: "var(--elev)", color: "var(--faint)", font: "9.5px var(--font-mono)", textTransform: "uppercase", letterSpacing: ".1em" }}>{label}</div>
      {rows.map((row) => {
        const isSelected = selected ? pairKey(row) === pairKey(selected) : false;
        return (
          <button
            key={`${label}:${pairKey(row)}`}
            type="button"
            aria-label={`${row.agent.id} on ${row.node.hostname || row.node.nodeId}`}
            disabled={disabled}
            onClick={() => onSelect(row)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "6px 12px",
              fontSize: 12.5, textAlign: "left", opacity: disabled ? .5 : 1,
              background: isSelected ? "var(--accent-wash-2)" : "none",
              boxShadow: isSelected ? "inset 0 0 0 1px var(--accent-line)" : "none",
            }}
          >
            <BrandIcon name={agentBrand(row.agent.kind, row.agent.provider)} size={20} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isSelected ? "var(--accent)" : "var(--text)" }}>{row.agent.id}</span>
            <span style={{ font: "9px var(--font-mono)", color: "var(--dim)", border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px" }}>{row.node.nodeId}</span>
          </button>
        );
      })}
    </section>
  );
}
