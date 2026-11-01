import type { RunSubagentSpawn } from "./types";

/** Props the Subagent element renders (trace + badge composition). */
export interface SubagentElementProps {
  /** "Ran the research agent" / "Running the research agent". */
  title: string;
  /** Trace status while the child session is working. */
  status: "running" | "error" | "pending" | undefined;
  /** Parent's description of the child's role, shown as a badge row. */
  description: string | null;
  /** Present while the child runs; null once idle/unknown. */
  activity: string | null;
}

/**
 * Map a sub-agent spawn/update (ACP SubagentUpdate) to Subagent element
 * props. While the child session is running the line shimmers; idle or
 * unset state reads as done (shadcn Subagent recipe "Running").
 */
export function toSubagentElementProps(
  spawn: RunSubagentSpawn,
): SubagentElementProps {
  const name = spawn.title ?? `sub-agent ${spawn.sessionId.slice(0, 8)}`;
  const running = spawn.state?.state === "running";

  return {
    title: running ? `Running ${name}` : `Ran ${name}`,
    status: running ? "running" : undefined,
    description: spawn.description ?? null,
    activity:
      spawn.state?.state === "running" ? (spawn.state.activity ?? null) : null,
  };
}
