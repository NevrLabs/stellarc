/**
 * Usage telemetry for the agent transcript (NEVR-243): the recorded
 * per-attempt rows getTask serves from agent_task_usage.
 *
 * Semantics pinned at this seam (charter law — the plane records what the
 * harness reported, never invents):
 * - Numbers are cumulative WITHIN an attempt: the harness reports session
 *   totals, the plane COALESCE-merges every report into one row. Last
 *   report wins; NEVER sum within an attempt.
 * - Absent fields are null — cost the harness did not report renders an
 *   em-dash, never $0.00. Currency renders only from costCurrency, never
 *   assumed.
 * - No pricing table, no model-id mapping, no client-side cost computation
 *   (Multica's MUL-8018/MUL-8050 mispricing bugs are exactly why).
 */

/** One usage row as the read path serves it (store.ts UsageRow, JSON form). */
export interface RunUsageRow {
  attempt: number;
  tokensTotal: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  thoughtTokens: number | null;
  cachedReadTokens: number | null;
  cachedWriteTokens: number | null;
  contextTokens: number | null;
  contextWindowSize: number | null;
  costAmount: number | null;
  costCurrency: string | null;
}

/** One usage item body the node streamed (ACP usage_update, subset). */
export interface RunUsageBody {
  contextTokens?: number;
  contextWindowSize?: number;
  costAmount?: number;
  costCurrency?: string;
}
