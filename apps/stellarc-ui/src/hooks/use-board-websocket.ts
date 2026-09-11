import { windowId } from "@kaneo/libs";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiWebSocketUrl } from "@/fetchers/get-ws-url";
import { authClient } from "@/lib/auth-client";

export function getWsUrl(boardId: string) {
  return apiWebSocketUrl(
    `${encodeURIComponent(boardId)}?windowId=${encodeURIComponent(windowId)}`,
  );
}

const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // 1 second

// Cloudflare closes idle WebSocket connections after 100 seconds of no traffic.
// We send a lightweight ping every 30 seconds to keep the connection alive.
const WS_PING_INTERVAL_MS = 30_000;

/**
 * How long a connection lingers after its last subscriber unmounts.
 *
 * Board/gantt/calendar/backlog each render their own BoardLayout, so switching
 * views unmounts one and mounts another for the SAME board. Closing on unmount
 * meant every view switch tore down the socket and re-ran the handshake. The
 * grace period lets the incoming view adopt the still-open connection.
 */
const IDLE_CLOSE_DELAY_MS = 10_000;

type Connection = {
  socket: WebSocket | null;
  refs: number;
  retries: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
};

/**
 * One connection per boardId, shared across every component that subscribes.
 * Module scope on purpose: the whole point is to outlive individual mounts.
 *
 * ponytail: a plain Map keyed by boardId. Entries are deleted when the last
 * subscriber leaves and the idle timer fires, so it can't grow unbounded.
 */
const connections = new Map<string, Connection>();

function handleMessage(event: MessageEvent, queryClient: QueryClient) {
  try {
    const message = JSON.parse(event.data);
    if (message.type === "PRESENCE_SNAPSHOT") {
      queryClient.setQueryData(
        ["board-presence", message.boardId],
        message.userIds,
      );
      return;
    }
    if (
      message.type === "PRESENCE_JOINED" ||
      message.type === "PRESENCE_LEFT"
    ) {
      queryClient.setQueryData<string[]>(
        ["board-presence", message.boardId],
        (current = []) =>
          message.type === "PRESENCE_JOINED"
            ? [...new Set([...current, message.userId])]
            : current.filter((id) => id !== message.userId),
      );
      return;
    }
    if (
      message.type === "TASK_UPDATED" ||
      message.type === "TASK_CREATED" ||
      message.type === "TASK_DELETED" ||
      message.type === "TASK_LABEL_UPDATED" ||
      message.type === "TASK_MOVED" ||
      message.type === "TASK_RELATION_UPDATED" ||
      message.type === "COMMENT_UPDATED"
    ) {
      queryClient.invalidateQueries({ queryKey: ["tasks", message.boardId] });

      // Ticket pickers (relations, sub-tickets, parent) read from these
      // caches; without this, a new ticket is invisible to search until
      // gcTime expires (KFL-376).
      if (
        message.type === "TASK_CREATED" ||
        message.type === "TASK_UPDATED" ||
        message.type === "TASK_DELETED" ||
        message.type === "TASK_MOVED"
      ) {
        queryClient.invalidateQueries({ queryKey: ["search"] });
        queryClient.invalidateQueries({ queryKey: ["parent-candidates"] });
      }

      if (message.type === "TASK_RELATION_UPDATED") {
        if (message.sourceTaskId) {
          queryClient.invalidateQueries({
            queryKey: ["task", message.sourceTaskId],
          });
          queryClient.invalidateQueries({
            queryKey: ["task-relations", message.sourceTaskId],
          });
        }
        if (message.targetTaskId) {
          queryClient.invalidateQueries({
            queryKey: ["task", message.targetTaskId],
          });
          queryClient.invalidateQueries({
            queryKey: ["task-relations", message.targetTaskId],
          });
        }
        if (!message.sourceTaskId && !message.targetTaskId) {
          queryClient.invalidateQueries({ queryKey: ["task-relations"] });
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ["task", message.taskId] });
      }

      if (message.type === "TASK_LABEL_UPDATED") {
        queryClient.invalidateQueries({
          queryKey: ["labels", message.taskId],
        });
      }

      if (message.type === "COMMENT_UPDATED") {
        queryClient.invalidateQueries({
          queryKey: ["activities", message.taskId],
        });
        queryClient.invalidateQueries({
          queryKey: ["comments", message.taskId],
        });
      }
    }
  } catch {
    // Ignore malformed messages
  }
}

function clearPing(conn: Connection) {
  if (conn.pingTimer) {
    clearInterval(conn.pingTimer);
    conn.pingTimer = null;
  }
}

function closeSocket(socket: WebSocket) {
  // Detach handlers first: closing a CONNECTING socket fires onclose, which
  // would otherwise schedule a reconnect for a teardown we requested.
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
  if (socket.readyState === WebSocket.CONNECTING) {
    // Aborting a handshake mid-flight is what makes the browser log
    // "connection interrupted while the page was loading". Wait for the
    // handshake, then close cleanly.
    socket.addEventListener("open", () => socket.close(1000), { once: true });
    return;
  }
  socket.close(1000);
}

function connect(boardId: string, conn: Connection, queryClient: QueryClient) {
  const socket = new WebSocket(getWsUrl(boardId));
  conn.socket = socket;

  socket.onopen = () => {
    conn.retries = 0;
    clearPing(conn);
    conn.pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping" }));
      }
    }, WS_PING_INTERVAL_MS);
  };

  socket.onmessage = (event) => handleMessage(event, queryClient);

  socket.onclose = () => {
    clearPing(conn);
    conn.socket = null;
    // Only retry while something is still listening.
    if (conn.refs > 0 && conn.retries < MAX_RETRIES) {
      const delay = BASE_DELAY * 2 ** conn.retries; // 1s, 2s, 4s, 8s, 16s
      conn.retries += 1;
      conn.reconnectTimer = setTimeout(
        () => connect(boardId, conn, queryClient),
        delay,
      );
    }
  };
}

/**
 * Subscribe to a board's realtime updates.
 *
 * Safe to call from several components at once (and across view switches) —
 * they share a single underlying socket per board.
 */
export function useBoardWebSocket(boardId: string) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (!boardId || !userId) return;

    let conn = connections.get(boardId);
    if (!conn) {
      conn = {
        socket: null,
        refs: 0,
        retries: 0,
        reconnectTimer: null,
        pingTimer: null,
        idleTimer: null,
      };
      connections.set(boardId, conn);
    }

    // Adopting an existing connection: cancel any pending idle close.
    if (conn.idleTimer) {
      clearTimeout(conn.idleTimer);
      conn.idleTimer = null;
    }

    conn.refs += 1;
    if (!conn.socket) {
      conn.retries = 0;
      connect(boardId, conn, queryClient);
    }

    return () => {
      const current = connections.get(boardId);
      if (!current) return;
      current.refs -= 1;
      if (current.refs > 0) return;

      // Last subscriber left. Keep the socket briefly in case this is a view
      // switch on the same board; only really close if nobody comes back.
      current.idleTimer = setTimeout(() => {
        const stale = connections.get(boardId);
        if (!stale || stale.refs > 0) return;
        if (stale.reconnectTimer) clearTimeout(stale.reconnectTimer);
        clearPing(stale);
        if (stale.socket) closeSocket(stale.socket);
        connections.delete(boardId);
      }, IDLE_CLOSE_DELAY_MS);
    };
  }, [boardId, userId, queryClient]);
}
