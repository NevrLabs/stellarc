import type { WSContext } from "hono/ws";
import { subscribeToEvent } from "../events";
import { isRedisConfigured } from "../redis";
import type {
  BoardBroadcastMessage,
  BroadcastAdapter,
  BroadcastMessage,
} from "./broadcast-adapter";
import { InMemoryBroadcastAdapter } from "./in-memory-broadcast-adapter";
import { RedisBroadcastAdapter } from "./redis-broadcast-adapter";

type BoardConnection = {
  ws: WSContext;
  userId: string;
  initiatorId: string;
};

type UserConnection = {
  ws: WSContext;
};

/**
 * User-scoped connections — tracks WebSocket connections keyed by userId.
 * Used for delivering user-targeted events like NOTIFICATION_CREATED.
 */
const userConnections = new Map<string, Set<UserConnection>>();

export function addUserConnection(userId: string, ws: WSContext) {
  if (!userConnections.has(userId)) {
    userConnections.set(userId, new Set());
  }
  const conn: UserConnection = { ws };
  userConnections.get(userId)?.add(conn);
  return conn;
}

export function removeUserConnection(userId: string, conn: UserConnection) {
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(conn);
    if (connections.size === 0) {
      userConnections.delete(userId);
    }
  }
}

export function broadcastToUser(
  userId: string,
  message: { type: string; [key: string]: unknown },
) {
  const connections = userConnections.get(userId);
  if (!connections) return;

  const payload = JSON.stringify(message);
  for (const conn of connections) {
    try {
      conn.ws.send(payload);
    } catch {
      connections.delete(conn);
    }
  }
  if (connections.size === 0) {
    userConnections.delete(userId);
  }
}

/**
 * Local connections — Each instance tracks only its own WebSocket connections.
 */
const boardConnections = new Map<string, Set<BoardConnection>>();

/**
 * Batching queues and timers local per-instance.
 * They accumulate messages before flushing to the broadcast adapter.
 */
const boardBroadcastQueues = new Map<
  string,
  Map<string, { message: BoardBroadcastMessage; excludeInitiatorId?: string }>
>();
const boardBroadcastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

let adapter: BroadcastAdapter | null = null;

// --- Subscribe to incoming broadcasts and deliver to local connections ---
export async function initializeWebSocketAdapter() {
  if (adapter) return;

  const nextAdapter = isRedisConfigured()
    ? new RedisBroadcastAdapter()
    : new InMemoryBroadcastAdapter();

  try {
    await nextAdapter.subscribe((msg: BroadcastMessage) => {
      deliverToLocalConnections(
        msg.boardId,
        msg.message,
        msg.excludeInitiatorId,
      );
    });
  } catch (err) {
    await nextAdapter.shutdown().catch(() => {});
    throw err;
  }

  adapter = nextAdapter;
  console.log(`📡 WebSockets Initialized using: "${adapter.constructor.name}"`);
}

export async function shutdownWebSocketAdapter() {
  const pendingQueues = [...boardBroadcastQueues.entries()];

  for (const timeout of boardBroadcastTimeouts.values()) {
    clearTimeout(timeout);
  }
  boardBroadcastTimeouts.clear();
  boardBroadcastQueues.clear();

  const currentAdapter = adapter;
  if (currentAdapter) {
    await Promise.allSettled(
      pendingQueues.flatMap(([boardId, queue]) =>
        [...queue.values()].map(({ message, excludeInitiatorId }) =>
          currentAdapter.publish({ boardId, message, excludeInitiatorId }),
        ),
      ),
    );
  }

  await currentAdapter?.shutdown();
  adapter = null;
}

function deliverToLocalConnections(
  boardId: string,
  message: BoardBroadcastMessage,
  excludeInitiatorId?: string,
) {
  const connections = boardConnections.get(boardId);
  if (!connections) return;

  const payload = JSON.stringify(message);
  for (const conn of connections) {
    if (excludeInitiatorId && conn.initiatorId === excludeInitiatorId) continue;
    try {
      conn.ws.send(payload);
    } catch {
      connections.delete(conn);
    }
  }
  if (connections.size === 0) {
    boardConnections.delete(boardId);
  }
}

export function addConnection(
  boardId: string,
  ws: WSContext,
  userId: string,
  initiatorId: string,
) {
  if (!boardConnections.has(boardId)) {
    boardConnections.set(boardId, new Set());
  }
  const conn: BoardConnection = { ws, userId, initiatorId };
  const connections = boardConnections.get(boardId);
  if (!connections) throw new Error("Board connection set was not initialized");
  connections.add(conn);
  const userIds = [...new Set([...connections].map((item) => item.userId))];
  ws.send(JSON.stringify({ type: "PRESENCE_SNAPSHOT", boardId, userIds }));
  broadcastToBoard(boardId, { type: "PRESENCE_JOINED", boardId, userId });
  return conn;
}

export function removeConnection(boardId: string, conn: BoardConnection) {
  const connections = boardConnections.get(boardId);
  if (connections) {
    connections.delete(conn);
    if (![...connections].some((item) => item.userId === conn.userId)) {
      broadcastToBoard(boardId, {
        type: "PRESENCE_LEFT",
        boardId,
        userId: conn.userId,
      });
    }
    if (connections.size === 0) {
      boardConnections.delete(boardId);
    }
  }
}

export function broadcastToBoard(
  boardId: string,
  message: BoardBroadcastMessage,
  excludeInitiatorId?: string,
) {
  if (!adapter) {
    console.warn("broadcastToBoard called before adapter initialization");
    return;
  }

  if (!boardBroadcastQueues.has(boardId)) {
    boardBroadcastQueues.set(boardId, new Map());
  }

  const messageKey = `${message.type}:${message.userId ?? ""}:${message.taskId ?? ""}:${message.sourceTaskId ?? ""}:${message.targetTaskId ?? ""}`;
  boardBroadcastQueues
    .get(boardId)
    ?.set(messageKey, { message, excludeInitiatorId });

  if (boardBroadcastTimeouts.has(boardId)) {
    return;
  }

  const timeout = setTimeout(() => {
    boardBroadcastTimeouts.delete(boardId);
    const queue = boardBroadcastQueues.get(boardId);
    boardBroadcastQueues.delete(boardId);

    if (!queue || !adapter) return;

    // Publish each queued message through the adapter
    for (const { message: msg, excludeInitiatorId: exId } of queue.values()) {
      void adapter
        .publish({
          boardId,
          message: msg,
          excludeInitiatorId: exId,
        })
        .catch((err) => {
          console.error(
            `Failed to publish broadcast for board ${boardId}:`,
            err,
          );
        });
    }
  }, 100);

  boardBroadcastTimeouts.set(boardId, timeout);
}

type TaskEvent = {
  id: string | undefined;
  boardId: string;
  userId: string;
  initiatorId?: string;
  taskId: string;
  sourceTaskId: string | undefined;
  targetTaskId: string | undefined;
};

const taskUpdateEvents = [
  "task.created",
  "task.updated",
  "task.deleted",
  "task.status_changed",
  "task.priority_changed",
  "task.unassigned",
  "task.assignee_changed",
  "task.due_date_changed",
  "task.title_changed",
  "task.description_changed",
  "task.label_assigned",
  "task.label_unassigned",
  "task.label_created",
  "task.label_deleted",
  "task-relation.created",
  "task-relation.deleted",
  "comment.created",
  "comment.deleted",
  "comment.updated",
];

subscribeToEvent<{
  taskId: string;
  userId: string;
  initiatorId?: string;
  type: string;
  content: string;
  fromBoardId: string;
  fromBoardName: string;
  toBoardId: string;
  toBoardName: string;
  oldStatus: string;
  newStatus: string;
}>("task.moved", async (data) => {
  const { fromBoardId, initiatorId, toBoardId, taskId } = data;

  broadcastToBoard(
    toBoardId,
    { type: "TASK_MOVED", boardId: toBoardId, taskId },
    initiatorId,
  );
  broadcastToBoard(
    fromBoardId,
    { type: "TASK_MOVED", boardId: fromBoardId, taskId },
    initiatorId,
  );
});

subscribeToEvent<{
  boardId: string;
  userId: string;
  initiatorId?: string;
}>("task-relation.refresh", async (data) => {
  const { boardId, initiatorId } = data;
  if (!boardId) return;

  broadcastToBoard(
    boardId,
    {
      type: "TASK_RELATION_UPDATED",
      boardId,
      taskId: "",
      sourceTaskId: undefined,
      targetTaskId: undefined,
    },
    initiatorId,
  );
});

subscribeToEvent<{ notificationId: string; userId: string }>(
  "notification.created",
  async (data) => {
    if (data.userId) {
      broadcastToUser(data.userId, { type: "NOTIFICATION_CREATED" });
    }
  },
);

for (const eventName of taskUpdateEvents) {
  subscribeToEvent<TaskEvent>(eventName, async (data) => {
    const { boardId, initiatorId } = data;
    const taskId = data.taskId;

    if (!boardId || !taskId) return;
    let type: string;
    switch (eventName) {
      case "task.created":
        type = "TASK_CREATED";
        break;
      case "task.deleted":
        type = "TASK_DELETED";
        break;
      case "task-relation.created":
      case "task-relation.deleted":
        type = "TASK_RELATION_UPDATED";
        break;
      case "task.label_assigned":
      case "task.label_unassigned":
      case "task.label_created":
      case "task.label_deleted":
        type = "TASK_LABEL_UPDATED";
        break;
      case "comment.created":
      case "comment.deleted":
      case "comment.updated":
        type = "COMMENT_UPDATED";
        break;
      default:
        type = "TASK_UPDATED";
    }

    broadcastToBoard(
      boardId,
      {
        type,
        boardId,
        taskId: taskId,
        sourceTaskId: data.sourceTaskId,
        targetTaskId: data.targetTaskId,
      },
      initiatorId,
    );
  });
}
