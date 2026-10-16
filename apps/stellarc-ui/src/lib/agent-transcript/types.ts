/**
 * Run-event adapter: ACP session updates -> agent-transcript element props
 * (NEVR-223).
 *
 * The transcript surface is composition-only over the shadcn AI elements
 * (trace/code-block/item); this module is the single place that knows how a
 * run's events map onto element props. A new event kind is a new mapping
 * entry here, not a component edit.
 *
 * Shapes follow the ACP schema (@agentclientprotocol/sdk 1.7.0,
 * SessionUpdate oneOf): tool_call/tool_call_update carry ToolCall(Status),
 * subagent_update carries SubagentUpdate(+StateUpdate), and permission
 * requests arrive as session/request_permission params
 * (RequestPermissionRequest with PermissionOption[]).
 */

/** Content blocks a tool call may produce (ACP ToolCallContent, subset). */
export type RunToolContent =
  | { type: "content"; text?: string }
  | {
      type: "diff";
      path: string;
      oldText?: string | null;
      newText: string;
    };

export type RunToolStatus = "pending" | "in_progress" | "completed" | "failed";

/** One ACP tool call, initial notification merged with any later updates. */
export interface RunToolCall {
  toolCallId: string;
  title: string;
  name?: string | null;
  kind?: string | null;
  status?: RunToolStatus;
  content?: RunToolContent[];
  locations?: Array<{ path: string; line?: number | null }>;
}

/** ACP PermissionOption as the deciding human sees it. */
export interface RunPermissionOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

/** A permission request (NEVR-198 approval transcript item shape). */
export interface RunPermissionRequest {
  sessionId: string;
  toolCallId: string;
  toolName: string | null;
  title: string | null;
  options: RunPermissionOption[];
}

/** ACP StateUpdate snapshot for a sub-agent (UNSTABLE spec shape). */
export type RunSubagentState =
  | { state: "running"; activity?: string | null }
  | { state: "idle" }
  | { state: "stopped"; reason?: string | null };

/** A sub-agent spawn/update (ACP SubagentUpdate, UNSTABLE spec shape). */
export interface RunSubagentSpawn {
  sessionId: string;
  title?: string | null;
  description?: string | null;
  state?: RunSubagentState | null;
}
