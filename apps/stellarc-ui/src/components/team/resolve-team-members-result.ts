type TeamMembersResult<T> = {
  data: T[] | null;
  error: {
    code?: string;
    message?: string;
  } | null;
};

export function resolveTeamMembersResult<T>({
  data,
  error,
}: TeamMembersResult<T>): T[] {
  // Better Auth 1.6 responds with 400 when a team has no members instead of
  // returning an empty array. Throwing leaves React Query's last successful
  // array cached, so a removed user visibly lingers forever.
  if (error?.code === "USER_IS_NOT_A_MEMBER_OF_THE_TEAM") return [];
  if (error) throw new Error(error.message || "Failed to load team members");
  return data ?? [];
}
