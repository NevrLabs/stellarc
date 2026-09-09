import type { PrincipalPickerOption } from "@/components/principal-picker-list";
import type { OrganizationPrincipal } from "@/fetchers/organization-member/get-organization-principals";

type TeamLike = { id: string; name: string };

/**
 * KFL-160: every host that feeds PrincipalPickerList built its own
 * member/team option array, so agent-ness had to be re-derived four times.
 * These helpers map the `/principals` response (which carries an explicit
 * `kind`) onto picker options once, so agents land in the Agents group on
 * every surface.
 */
export function buildPrincipalPickerOptions(
  principals: OrganizationPrincipal[] | undefined,
  teams: TeamLike[] | undefined,
): PrincipalPickerOption[] {
  const people = (principals ?? []).map((principal) => ({
    type: principal.kind === "agent" ? ("agent" as const) : ("user" as const),
    value: principal.id,
    label: principal.name,
    image: principal.image ?? undefined,
  }));

  const teamOptions = (teams ?? []).map((team) => ({
    type: "team" as const,
    value: team.id,
    label: team.name,
  }));

  return [...people, ...teamOptions];
}

/**
 * Map a stored assignment onto the picker's selection shape. An assigned agent
 * is stored in the same `userId` column as a human, so the principal list is
 * what decides which group shows the check mark. Before the list loads we fall
 * back to "user" rather than guessing.
 */
export function resolvePrincipalSelection(
  assignment: { userId?: string | null; teamId?: string | null },
  principals: OrganizationPrincipal[] | undefined,
): { type: "user" | "agent" | "team"; value: string } | null {
  if (assignment.userId) {
    const principal = principals?.find((p) => p.id === assignment.userId);
    return {
      type: principal?.kind === "agent" ? "agent" : "user",
      value: assignment.userId,
    };
  }
  if (assignment.teamId) {
    return { type: "team", value: assignment.teamId };
  }
  return null;
}
