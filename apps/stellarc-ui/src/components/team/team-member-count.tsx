/**
 * Header count for a team card.
 *
 * #121: this used to render `membership.length` inline and unconditionally, so
 * while the team-members query was loading — or refetching after a member was
 * removed — the card asserted "0 members" directly above a list that still
 * read "Loading members…". A count we do not have yet must not be stated as
 * fact, so the loading case says so instead of guessing zero.
 */
export function TeamMemberCount({
  isPending,
  memberCount,
}: {
  isPending: boolean;
  memberCount: number;
}) {
  if (isPending) {
    return <span data-testid="team-member-count-loading">Loading…</span>;
  }

  return (
    <span data-testid="team-member-count">
      {memberCount} {memberCount === 1 ? "member" : "members"}
    </span>
  );
}

export default TeamMemberCount;
