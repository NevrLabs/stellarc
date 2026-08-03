import { useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { parseRoute } from "../router";
import { apiFetch, authHeaders } from "../api";

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block size-1.5 rounded-full ${ok ? "bg-[var(--ok)]" : "bg-[var(--err)]"}`} />;
}

/** View-level StatusBar: global connection/environment context without
 * competing with Panel headers or Drawer controls. */
export function StatusBar() {
  const { location } = useRouterState();
  const route = parseRoute(location.pathname);
  const health = useQuery({
    queryKey: ["axis-health"],
    queryFn: async () => {
      const response = await apiFetch("/api/health", { headers: authHeaders() });
      if (!response.ok) throw new Error(`Axis health: ${response.status}`);
      return true;
    },
    retry: false,
    refetchInterval: 15_000,
  });
  const axisOnline = health.data === true && !health.isError;

  return (
    <footer className="statusbar" aria-label="Application status">
      <span className="statusbar-item"><StatusDot ok={axisOnline} />Axis {axisOnline ? "connected" : health.isPending ? "checking" : "offline"}</span>
      <span className="statusbar-separator" />
      <span className="statusbar-item">View: {route.surface}</span>
      {route.sessionId && <><span className="statusbar-separator" /><span className="statusbar-item mono">Session: {route.sessionId.slice(0, 12)}</span></>}
      <span className="statusbar-spacer" />
      <span className="statusbar-item">{import.meta.env.VITE_STELLARC_ENV === "dev" ? "Development" : "Production"}</span>
    </footer>
  );
}
