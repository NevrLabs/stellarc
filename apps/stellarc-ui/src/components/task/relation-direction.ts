export type RelationIntent = "blocks" | "blocked_by" | "related";

/**
 * Convert modal language into the one canonical stored edge.
 * `blocks` means source -> target; `blocked_by` is the same edge reversed.
 */
export function relationPayload({
  currentTaskId,
  selectedTaskId,
  intent,
}: {
  currentTaskId: string;
  selectedTaskId: string;
  intent: RelationIntent;
}) {
  const blockedBy = intent === "blocked_by";
  return {
    sourceTaskId: blockedBy ? selectedTaskId : currentTaskId,
    targetTaskId: blockedBy ? currentTaskId : selectedTaskId,
    relationType: blockedBy ? ("blocks" as const) : intent,
  };
}

/** Label a canonical stored edge from one endpoint's perspective. */
export function relationDisplayType({
  currentTaskId,
  sourceTaskId,
  relationType,
}: {
  currentTaskId: string;
  sourceTaskId: string;
  relationType: string;
}): string {
  return relationType === "blocks" && sourceTaskId !== currentTaskId
    ? "blocked_by"
    : relationType;
}
