import type { RunUsageBody, RunUsageRow } from "./usage-types";

/**
 * Props the Usage element renders (trace-only composition, NEVR-243).
 *
 * Absent cost is `null` through to the element: it renders an em-dash,
 * never $0.00. Cost renders only when BOTH amount and currency are present
 * (a currency-less amount would imply an assumed currency).
 */
export interface UsageLineProps {
  /** "Attempt 2" label prefix. */
  attempt: number;
  /** in/out/total token counts; null fields render an em-dash. */
  tokensIn: number | null;
  tokensOut: number | null;
  tokensTotal: number | null;
  /** Context fill + window when the harness reported them. */
  contextTokens: number | null;
  contextWindowSize: number | null;
  /** Harness-reported cumulative session cost; null = not reported. */
  costAmount: number | null;
  /** ISO currency from cost_currency; null = not reported. */
  costCurrency: string | null;
}

/** Totals roll-up line above the attempts (rendered only when usage exists). */
export interface UsageTotalsProps {
  /** Sum across attempts of each token counter (null fields contribute 0
   * to the SUM only — a reported-null attempt never fabricates a number). */
  tokensIn: number;
  tokensOut: number;
  tokensTotal: number;
  /** Sum across attempts that REPORT a cost; null when none did. */
  costAmount: number | null;
  /** Currency of the summed cost; null when costAmount is null. */
  costCurrency: string | null;
  attempts: number;
}

export interface UsageElementProps {
  totals: UsageTotalsProps | null;
  lines: UsageLineProps[];
}

const ABSENT = "—";

const fmtInt = (v: number | null): string =>
  v === null ? ABSENT : v.toLocaleString("en-US");

/** Cost renders only from reported fields: amount AND currency, or em-dash.
 * Never "$0.00", never an assumed currency. */
export const formatCost = (
  amount: number | null,
  currency: string | null,
): string =>
  amount === null || currency === null
    ? ABSENT
    : `${amount.toFixed(2)} ${currency}`;

const contextOf = (row: {
  contextTokens: number | null;
  contextWindowSize: number | null;
}): string => {
  if (
    row.contextTokens === null ||
    row.contextWindowSize === null ||
    row.contextWindowSize <= 0
  ) {
    return ABSENT;
  }
  return `${fmtInt(row.contextTokens)} / ${fmtInt(row.contextWindowSize)}`;
};

/** One recorded usage row → one attempt line. Field-by-field; absent stays
 * absent (null), reported values pass through unmodified. */
export function toUsageLineProps(row: RunUsageRow): UsageLineProps {
  return {
    attempt: row.attempt,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    tokensTotal: row.tokensTotal,
    contextTokens: row.contextTokens,
    contextWindowSize: row.contextWindowSize,
    costAmount: row.costAmount,
    costCurrency: row.costCurrency,
  };
}

/** A usage item body (ACP usage_update) → one attempt line; unreported
 * fields absent. A new payload shape is a new mapping entry, not a
 * component edit. */
export function toUsageLineFromBody(
  attempt: number,
  body: RunUsageBody,
): UsageLineProps {
  return {
    attempt,
    tokensIn: null,
    tokensOut: null,
    tokensTotal: null,
    contextTokens: body.contextTokens ?? null,
    contextWindowSize: body.contextWindowSize ?? null,
    costAmount: body.costAmount ?? null,
    costCurrency: body.costCurrency ?? null,
  };
}

/** Roll-up over the recorded rows: tokens summed across attempts, cost
 * summed across attempts that report one. Null when no row exists — the
 * totals line renders only when at least one attempt reported usage. */
export function toUsageTotalsProps(
  rows: RunUsageRow[],
): UsageTotalsProps | null {
  if (rows.length === 0) return null;
  const sum = (pick: (r: RunUsageRow) => number | null): number =>
    rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0);
  const costRows = rows.filter(
    (r) => r.costAmount !== null && r.costCurrency !== null,
  );
  return {
    tokensIn: sum((r) => r.tokensIn),
    tokensOut: sum((r) => r.tokensOut),
    tokensTotal: sum((r) => r.tokensTotal),
    costAmount:
      costRows.length === 0
        ? null
        : costRows.reduce((acc, r) => acc + (r.costAmount ?? 0), 0),
    // Every recorded cost row carries the same task currency in practice;
    // if they ever disagree, show the first rather than invent a blend.
    costCurrency: costRows[0]?.costCurrency ?? null,
    attempts: rows.length,
  };
}

/** Recorded usage rows → Usage element props (totals + one line per attempt,
 * in the order the read path served them). */
export function toUsageElementProps(rows: RunUsageRow[]): UsageElementProps {
  return {
    totals: toUsageTotalsProps(rows),
    lines: rows.map(toUsageLineProps),
  };
}

export { ABSENT, contextOf, fmtInt };
