// Dev-friendly full session status: node binding, orbit connectivity,
// runtime held, in-flight/awaiting flags — everything Axis knows, one click.
// Data source: GET /api/sessions/:id/diagnostics (assembled server-side from
// live state, no polling storm — refetch on open + 5s while open).
import { useQuery } from "@tanstack/react-query";
import { apiFetch, authHeaders } from "../../../api";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type Diagnostics = {
  sessionId: string;
  hermesId: string;
  source: string;
  managed: boolean;
  agent: string | null;
  model: string | null;
  node: string | null;
  liveness: string;
  inFlight: boolean;
  awaitingInput: boolean;
  runtimeHeld: boolean;
  orbitConnected: boolean;
  lastActivity: number;
  messageCount: number;
  nodeInfo: {
    nodeId: string;
    hostname: string;
    status: string;
    slotsUsed: number;
    slotsTotal: number;
    version: string;
    local: boolean;
    lastHeartbeatAgoSecs: number;
    transport: string;
    agents: { id: string }[];
  } | null;
};

function useDiagnostics(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["session-diagnostics", sessionId],
    queryFn: async (): Promise<Diagnostics> => {
      const r = await apiFetch(`/api/sessions/${sessionId}/diagnostics`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(`diagnostics: ${r.status}`);
      return r.json();
    },
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

function Row({ k, v, ok }: { k: string; v: React.ReactNode; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className={ok === undefined ? "" : ok ? "text-[var(--ok)]" : "text-[var(--err)]"}>
        {v}
      </span>
    </div>
  );
}

function yn(b: boolean) {
  return b ? "yes" : "no";
}

import { useState } from "react";

export function SessionStatusPopover({ sessionId, liveness }: { sessionId: string; liveness?: string }) {
  const [open, setOpen] = useState(false);
  const { data: d, isLoading } = useDiagnostics(sessionId, open);
  const dotClass =
    liveness === "active" || liveness === "running"
      ? "bg-[var(--ok)]"
      : liveness === "input-required"
        ? "bg-[var(--warn)]"
        : "bg-[var(--text-faint)]";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="xs" title="Session status" aria-label="Session status">
            <span className={`inline-block size-2 rounded-full ${dotClass}`} />
            <span className="text-[11px] uppercase tracking-wide">{liveness ?? "…"}</span>
          </Button>
        }
      />
      <PopoverContent className="w-80 text-sm" align="end">
        {isLoading || !d ? (
          <div className="py-2 text-xs text-muted-foreground">Loading diagnostics…</div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Session</span>
              <Badge variant="outline">{d.source}</Badge>
            </div>
            <Row k="liveness" v={d.liveness} />
            <Row k="managed" v={yn(d.managed)} />
            <Row k="turn in flight" v={yn(d.inFlight)} ok={d.inFlight ? true : undefined} />
            <Row k="awaiting input" v={yn(d.awaitingInput)} ok={d.awaitingInput ? false : undefined} />
            <Row k="runtime held by axis/orbit" v={yn(d.runtimeHeld)} ok={d.runtimeHeld} />
            <Row k="agent" v={d.agent ?? "—"} />
            <Row k="model" v={d.model ?? "—"} />
            <Row k="messages" v={d.messageCount} />
            <Separator />
            <div className="font-medium">Node</div>
            {d.node === null ? (
              <div className="text-xs text-muted-foreground">not bound to a node</div>
            ) : d.nodeInfo === null ? (
              <Row k={d.node} v="not in registry" ok={false} />
            ) : (
              <>
                <Row k="node" v={`${d.nodeInfo.nodeId} (${d.nodeInfo.hostname})`} />
                <Row
                  k="status"
                  v={d.nodeInfo.status}
                  ok={d.nodeInfo.status.toLowerCase() === "online"}
                />
                <Row k="orbit connected" v={yn(d.orbitConnected)} ok={d.orbitConnected || d.nodeInfo.local} />
                <Row k="transport" v={d.nodeInfo.transport} />
                <Row k="slots" v={`${d.nodeInfo.slotsUsed}/${d.nodeInfo.slotsTotal}`} />
                <Row k="heartbeat" v={`${d.nodeInfo.lastHeartbeatAgoSecs}s ago`} ok={d.nodeInfo.lastHeartbeatAgoSecs < 60} />
                <Row k="orbit version" v={d.nodeInfo.version} />
              </>
            )}
            <Separator />
            <div className="text-[10px] text-muted-foreground font-mono break-all">
              hermes: {d.hermesId}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
