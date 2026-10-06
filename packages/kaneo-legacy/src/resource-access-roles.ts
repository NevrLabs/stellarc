// Pure, db-free role check so it can be unit-tested without importing the
// database layer. getResourcePrivilege bypasses board-level resource grants for
// anyone with org-wide access: system admins, org owners, AND org admins. The
// last case was the "Board not found" bug -- an org admin was previously capped
// by board grants because only "owner" was checked here.
export function hasOrganizationWideResourceAccess(
  userRole: string | null | undefined,
  membershipRole: string | null | undefined,
) {
  return (
    userRole === "admin" ||
    membershipRole === "owner" ||
    membershipRole === "admin"
  );
}
