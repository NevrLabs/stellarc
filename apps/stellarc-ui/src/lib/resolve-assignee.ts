/**
 * Resolves what the assignee control should display for a ticket.
 *
 * A ticket is assigned to a USER or a TEAM — `userId` and `teamId` are mutually
 * exclusive columns. Every display site used to branch on `task.userId` alone,
 * so a ticket assigned to a team rendered "Unassigned" even though the
 * assignment had saved and the picker showed it. The API already returns
 * `teamAssigneeName` for this case.
 *
 * Lives in its own module so the sidebar and its regression test share one
 * implementation rather than each modelling the rule separately.
 */

export type AssigneeTaskFields = {
  userId?: string | null;
  teamId?: string | null;
  assigneeName?: string | null;
  teamAssigneeName?: string | null;
};

export type ResolvedAssignee = {
  /** Text for the control. Never empty. */
  label: string;
  /** True when a user OR a team is assigned. Drives the avatar vs "?" glyph. */
  hasAssignee: boolean;
  /** Non-null only for team assignment; drives the team glyph. */
  teamName: string | null;
};

export function resolveAssignee({
  task,
  memberName,
  unassignedLabel,
  teamFallbackLabel,
}: {
  task: AssigneeTaskFields | undefined | null;
  /** Name from the loaded org member list, when available. */
  memberName?: string | null;
  unassignedLabel: string;
  teamFallbackLabel: string;
}): ResolvedAssignee {
  // Team wins when teamId is set: after reassigning user → team a stale
  // assigneeName may still be present on the row.
  const teamName = task?.teamId
    ? task.teamAssigneeName || teamFallbackLabel
    : null;

  return {
    teamName,
    hasAssignee: Boolean(task?.userId || task?.teamId),
    label: teamName || memberName || task?.assigneeName || unassignedLabel,
  };
}

export default resolveAssignee;
