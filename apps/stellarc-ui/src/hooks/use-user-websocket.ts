import { windowId } from "@kaneo/libs";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiWebSocketUrl } from "@/fetchers/get-ws-url";
import { authClient } from "@/lib/auth-client";
import { invalidateProjectQueries } from "@/lib/project-sync-invalidation";
import { invalidateRepoQueries } from "@/lib/repo-sync-invalidation";

export function getUserWsUrl() {
  return apiWebSocketUrl(`user?windowId=${encodeURIComponent(windowId)}`);
}

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const WS_PING_INTERVAL_MS = 30_000;

/**
 * Maintains a user-scoped WebSocket connection for receiving user-targeted
 * real-time events (e.g. NOTIFICATION_CREATED). Invalidates TanStack Query
 * caches as needed — no polling required.
 */
export function useUserWebSocket() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    retriesRef.current = 0;

    function clearPing() {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    }

    function connect() {
      const url = getUserWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        clearPing();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, WS_PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as {
            type?: string;
            repoId?: string;
            projectId?: string;
          };
          if (message.type === "NOTIFICATION_CREATED") {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
          if (message.type === "REPO_SYNCED") {
            // A provider mirror finished (webhook, scheduler or manual
            // resync). Repo queries never poll, so this push is the only
            // way the UI learns about new issues/PRs without a reload.
            invalidateRepoQueries(queryClient, message.repoId);
          }
          if (
            message.type === "PROJECT_CREATED" ||
            message.type === "PROJECT_UPDATED" ||
            message.type === "PROJECT_ARCHIVED" ||
            message.type === "PROJECT_UNARCHIVED" ||
            message.type === "PROJECT_UPDATE_CREATED" ||
            message.type === "PROJECT_UPDATE_UPDATED" ||
            message.type === "PROJECT_UPDATE_DELETED"
          ) {
            // Project mutations never poll and Kaneo disables
            // refetch-on-focus, so this push is the only way the Projects
            // overview, detail page and sidebar learn about a change made
            // in another tab or by another org member.
            invalidateProjectQueries(queryClient, message.projectId);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        clearPing();
        wsRef.current = null;

        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY * 2 ** retriesRef.current;
          retriesRef.current += 1;
          timeoutRef.current = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      retriesRef.current = MAX_RETRIES; // Prevent reconnect after unmount
      clearPing();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      const socket = wsRef.current;
      wsRef.current = null;
      if (!socket) return;
      // Detach handlers first: closing a CONNECTING socket fires onclose, which
      // would otherwise schedule a reconnect for a teardown we requested.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.CONNECTING) {
        // Aborting a handshake mid-flight is what makes the browser log
        // "connection interrupted while the page was loading" (StrictMode's
        // double-invoke in dev). Wait for the handshake, then close cleanly.
        socket.addEventListener("open", () => socket.close(1000), {
          once: true,
        });
        return;
      }
      socket.close(1000);
    };
  }, [session?.user?.id, queryClient]);
}
