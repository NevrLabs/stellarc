import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  CornerDownRight,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import PermissionDenied from "@/components/permission-denied";
import {
  type PrincipalOption,
  PrincipalSelector,
} from "@/components/principal-selector";
import { resolveTeamMembersResult } from "@/components/team/resolve-team-members-result";
import TeamMemberCount from "@/components/team/team-member-count";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  getEffectiveTeamMembers,
  getTeamHierarchy,
  setTeamParent,
} from "@/fetchers/team/team-hierarchy";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { orgPath as identityOrgPath } from "@/lib/identity-client";
import type { MemberPublic, TeamPublic } from "@/lib/identity-collections";

// Identity API base for the fetches below (mirrors lib/identity-client.ts,
// which cannot be imported wholesale here because the module also exports
// error classes used by other surfaces — keep the URL builder local).
function identityUrl(path: string) {
  const trimmedBase = (
    import.meta.env.VITE_API_URL || "http://localhost:1337"
  ).replace(/\/+$/, "");
  const base = trimmedBase.endsWith("/api")
    ? trimmedBase
    : `${trimmedBase}/api`;
  return `${base}/identity${path}`;
}

function orgPath(org: string, ...rest: string[]): string {
  return identityOrgPath(org, ...rest);
}

type Team = TeamPublic;
type TeamMemberRow = {
  id: string;
  teamId: string;
  userId: string;
  organizationId: string;
  createdAt: string | null;
  name?: string | null;
};

import { getAvatarTone } from "@/lib/avatar-tone";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization/teams",
)({
  beforeLoad: async () => {
    // STL-15 (rework c13, D10): resolve the org via the identity API instead
    // of the unmounted Better Auth organization-plugin route.
    try {
      const trimmedBase = (
        import.meta.env.VITE_API_URL || "http://localhost:1337"
      ).replace(/\/+$/, "");
      const base = trimmedBase.endsWith("/api")
        ? trimmedBase
        : `${trimmedBase}/api`;
      const res = await fetch(`${base}/identity/organizations`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const { organizations } = (await res.json()) as {
        organizations: Array<{ id: string }>;
      };
      if (!organizations?.[0]?.id) return;
      throw redirect({
        to: "/dashboard/organization/$organizationSlug/members",
        params: { organizationId: organizations[0].id },
        search: { tab: "teams" },
        replace: true,
      });
    } catch (error) {
      // redirect() throws by design — rethrow untouched.
      if (error && typeof error === "object" && "to" in (error as object)) {
        throw error;
      }
      return;
    }
  },
  component: TeamsSettings,
});

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function TeamsSettings() {
  return null;
}

export function TeamsManagement({
  createTeamSignal = 0,
}: {
  createTeamSignal?: number;
}) {
  const queryClient = useQueryClient();
  const { organization, isAdmin } = useOrganizationPermission();
  const organizationId = organization?.id ?? "";
  const [editor, setEditor] = useState<{ team?: Team; name: string } | null>(
    null,
  );
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);

  useEffect(() => {
    if (createTeamSignal > 0) setEditor({ name: "" });
  }, [createTeamSignal]);

  const teamsQuery = useQuery({
    queryKey: ["organization-teams", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const res = await fetch(identityUrl(orgPath(organizationId, "teams")), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load teams");
      const { teams } = (await res.json()) as { teams: Team[] };
      return teams;
    },
  });

  /*
    Parent links come from /api/team/hierarchy, NOT from listTeams: Better
    Auth's client parses responses against its own schema and drops
    additionalFields it does not recognize, so parentTeamId never reaches the
    browser through it (verified against the live payload — the field is in
    the HTTP response and absent from the parsed result).
  */
  const hierarchyQuery = useQuery({
    queryKey: ["team-hierarchy", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => getTeamHierarchy(organizationId),
  });
  const parentByTeamId = useMemo(
    () =>
      new Map(
        (hierarchyQuery.data ?? []).map((row) => [row.id, row.parentTeamId]),
      ),
    [hierarchyQuery.data],
  );

  const membersQuery = useQuery({
    queryKey: ["organization-members", organizationId, "teams-settings"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const res = await fetch(identityUrl(orgPath(organizationId, "members")), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load members");
      const { members } = (await res.json()) as { members: MemberPublic[] };
      return members;
    },
  });

  const saveTeam = useMutation({
    mutationFn: async ({ team, name }: { team?: Team; name: string }) => {
      const res = await fetch(
        identityUrl(
          team
            ? orgPath(organizationId, "teams", team.id)
            : orgPath(organizationId, "teams"),
        ),
        {
          method: team ? "PATCH" : "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(team ? { name } : { name }),
        },
      );
      if (!res.ok) throw new Error("Failed to save team");
      const saved = (await res.json()) as { data: Team };
      return saved.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-teams", organizationId],
      });
      setEditor(null);
      toast.success("Team saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to save team")),
  });

  const deleteTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const res = await fetch(
        identityUrl(orgPath(organizationId, "teams", teamId)),
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to delete team");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["organization-teams", organizationId],
      });
      setTeamToDelete(null);
      toast.success("Team deleted");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Failed to delete team")),
  });

  if (!isAdmin) {
    return (
      <PermissionDenied description="You do not have permission to manage teams." />
    );
  }

  const teams = teamsQuery.data ?? [];
  return (
    <>
      <div>
        {teamsQuery.isLoading ? (
          /*
            Skeleton cards, not a bare text line: the old "Loading teams…"
            string sat flush against the header divider on an otherwise blank
            page and read as broken.
          */
          <div className="space-y-4">
            {[0, 1].map((n) => (
              <div
                className="animate-pulse rounded-md border border-border bg-sidebar"
                key={n}
              >
                <div className="border-b border-border px-4 py-3">
                  <div className="h-4 w-32 rounded bg-muted" />
                </div>
                <div className="space-y-3 p-4">
                  <div className="h-7 w-full max-w-sm rounded bg-muted" />
                  <div className="h-10 w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : teamsQuery.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(teamsQuery.error, "Failed to load teams")}
          </p>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-border py-12 text-center">
            <UsersRound className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">No teams yet</p>
              <p className="text-xs text-muted-foreground">
                Create a team to organize members.
              </p>
            </div>
            {/* Direct CTA: the header's "+ New team" is far from this message. */}
            <Button
              className="gap-1"
              onClick={() => setEditor({ name: "" })}
              size="sm"
              variant="outline"
            >
              <Plus className="size-3.5" /> New team
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                teams={teams}
                parentByTeamId={parentByTeamId}
                organizationId={organizationId}
                organizationMembers={membersQuery.data ?? []}
                onRename={() => setEditor({ team, name: team.name })}
                onDelete={() => setTeamToDelete(team)}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => !open && setEditor(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="gap-1.5 p-5 pb-2">
            <DialogTitle>
              {editor?.team ? "Rename team" : "Create team"}
            </DialogTitle>
            <DialogDescription>
              Team names must be unique within the organization.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-1.5 px-5 py-3">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              autoFocus
              value={editor?.name ?? ""}
              onChange={(event) =>
                setEditor(
                  (value) => value && { ...value, name: event.target.value },
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" && editor?.name.trim()) {
                  saveTeam.mutate({
                    team: editor.team,
                    name: editor.name.trim(),
                  });
                }
              }}
            />
          </DialogPanel>
          <DialogFooter variant="bare" className="px-5 pt-0 pb-5">
            <Button variant="outline" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editor?.name.trim() || saveTeam.isPending}
              onClick={() =>
                editor &&
                saveTeam.mutate({ team: editor.team, name: editor.name.trim() })
              }
            >
              {saveTeam.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(teamToDelete)}
        onOpenChange={(open) => !open && setTeamToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {teamToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the team. Organization members will not
              be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              disabled={deleteTeam.isPending}
              onClick={() => teamToDelete && deleteTeam.mutate(teamToDelete.id)}
            >
              {deleteTeam.isPending ? "Deleting…" : "Delete team"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type OrganizationMember = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string; image: string | null };
};

function TeamCard({
  team,
  teams,
  parentByTeamId,
  organizationId,
  organizationMembers,
  onRename,
  onDelete,
}: {
  team: Team;
  teams: Team[];
  parentByTeamId: Map<string, string | null>;
  organizationId: string;
  organizationMembers: OrganizationMember[];
  onRename: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [memberId, setMemberId] = useState("");
  const queryKey = ["organization-team-members", team.id];
  const teamMembersQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        identityUrl(orgPath(organizationId, "teams", team.id, "members")),
        { credentials: "include" },
      );
      if (!res.ok) return { members: [] as TeamMemberRow[] };
      const body = (await res.json()) as { members: TeamMemberRow[] };
      return { members: body.members };
    },
  });
  /*
    Effective membership (sub-teams): direct rows plus everyone inherited from
    descendant sub-teams, each inherited row tagged with the sub-team that
    contributes it. Direct add/remove still goes through Better Auth above —
    this query only supplies the rendered list and the provenance badges.
  */
  const effectiveQuery = useQuery({
    queryKey: ["team-effective-members", team.id],
    queryFn: () => getEffectiveTeamMembers(team.id, organizationId),
  });
  const parentTeamId = parentByTeamId.get(team.id) ?? null;
  // Identity DELETE keys on the team_member row id; the fork UI hands us the
  // user id, so resolve through the loaded roster.
  const rosterUserIdToMemberId = (userId: string): string | null =>
    teamMembersQuery.data?.members?.find((row) => row.userId === userId)?.id ??
    teamMembersQuery.data?.find?.((row: TeamMemberRow) => row.userId === userId)
      ?.id ??
    null;
  const setParent = useMutation({
    mutationFn: (nextParentId: string | null) =>
      setTeamParent(team.id, organizationId, nextParentId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["organization-teams", organizationId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["team-hierarchy", organizationId],
        }),
        // every ancestor's effective list may change
        queryClient.invalidateQueries({ queryKey: ["team-effective-members"] }),
      ]);
      toast.success("Team parent updated");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Failed to update team parent")),
  });
  /*
    Valid parents: any team except this one and its descendants (a cycle). The
    server re-checks; filtering here just keeps impossible options out of the
    dropdown.
  */
  const descendantIds = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    for (const candidate of teams) {
      const parent = parentByTeamId.get(candidate.id);
      if (parent) {
        childrenByParent.set(parent, [
          ...(childrenByParent.get(parent) ?? []),
          candidate.id,
        ]);
      }
    }
    const blocked = new Set<string>([team.id]);
    const queue = [team.id];
    while (queue.length) {
      const current = queue.pop();
      for (const child of childrenByParent.get(current ?? "") ?? []) {
        if (!blocked.has(child)) {
          blocked.add(child);
          queue.push(child);
        }
      }
    }
    return blocked;
  }, [teams, team.id, parentByTeamId]);
  const parentOptions = teams.filter(
    (candidate) => !descendantIds.has(candidate.id),
  );
  const membership = teamMembersQuery.data ?? [];
  const effectiveMembers = effectiveQuery.data ?? [];
  const memberByUserId = useMemo(
    () => new Map(organizationMembers.map((member) => [member.userId, member])),
    [organizationMembers],
  );
  const availableMembers = organizationMembers.filter(
    (member) => !membership.some((entry) => entry.userId === member.userId),
  );
  const changeMembership = useMutation({
    mutationFn: async ({
      userId,
      remove,
    }: {
      userId: string;
      remove?: boolean;
    }) => {
      const res = await fetch(
        identityUrl(
          remove
            ? orgPath(
                organizationId,
                "teams",
                team.id,
                "members",
                // removal keys on the team_member row id; resolve via the
                // loaded roster when the caller only knows the user id.
                rosterUserIdToMemberId(userId) ?? userId,
              )
            : orgPath(organizationId, "teams", team.id, "members"),
        ),
        remove
          ? { method: "DELETE", credentials: "include" }
          : {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ userId }),
            },
      );
      if (!res.ok) throw new Error("Failed to update team members");
    },
    onSuccess: async () => {
      setMemberId("");
      // #121: a removed member lingered until a manual refresh. Awaiting the
      // refetch (not just marking stale) means the row is gone by the time the
      // success toast appears. The organization-members list is invalidated
      // too because `availableMembers` is derived from it — otherwise the
      // add-dropdown keeps offering someone who is already back in the pool.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, refetchType: "active" }),
        queryClient.invalidateQueries({
          queryKey: ["organization-members", organizationId],
        }),
        // ancestors inherit this change
        queryClient.invalidateQueries({ queryKey: ["team-effective-members"] }),
      ]);
      toast.success("Team members updated");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Failed to update team members")),
  });

  return (
    <section className="rounded-md border border-border bg-sidebar">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            {parentTeamId ? (
              <CornerDownRight
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            ) : null}
            <span className="truncate">{team.name}</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            <TeamMemberCount
              isPending={effectiveQuery.isPending}
              memberCount={effectiveMembers.length}
            />
            {parentTeamId ? (
              <span>
                {" · sub-team of "}
                {teams.find((candidate) => candidate.id === parentTeamId)
                  ?.name ?? "unknown"}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Select
            disabled={setParent.isPending}
            onValueChange={(value) =>
              setParent.mutate(value === "none" ? null : value)
            }
            value={parentTeamId ?? "none"}
          >
            <SelectTrigger
              aria-label={`Parent team of ${team.name}`}
              className="h-7 w-40 text-xs"
              data-testid="team-parent-select"
            >
              {/* Explicit label: SelectValue would render the raw id here. */}
              <span className="truncate">
                {parentTeamId
                  ? (teams.find((candidate) => candidate.id === parentTeamId)
                      ?.name ?? "Unknown team")
                  : "No parent"}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No parent</SelectItem>
              {parentOptions.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Rename ${team.name}`}
            onClick={onRename}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${team.name}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <PrincipalSelector
            aria-label={`Add member to ${team.name}`}
            className="h-8 flex-1 sm:h-7"
            disabled={changeMembership.isPending}
            emptyMessage="No organization members available."
            kinds={["member"]}
            loading={teamMembersQuery.isLoading}
            onValueChange={(selection) => setMemberId(selection[0]?.id ?? "")}
            options={availableMembers.map(
              (member): PrincipalOption => ({
                id: member.userId,
                kind: "member",
                name: member.user.name,
                detail: member.user.email,
              }),
            )}
            placeholder="Select an organization member"
            searchPlaceholder="Search organization members…"
            value={
              memberId && memberByUserId.has(memberId)
                ? [
                    {
                      id: memberId,
                      kind: "member",
                      name: memberByUserId.get(memberId)?.user.name ?? "Member",
                      detail: memberByUserId.get(memberId)?.user.email,
                    },
                  ]
                : []
            }
          />
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!memberId || changeMembership.isPending}
            onClick={() => changeMembership.mutate({ userId: memberId })}
          >
            <UserPlus className="size-3.5" /> Add
          </Button>
        </div>
        {effectiveQuery.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading members…</p>
        ) : effectiveMembers.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            No members in this team.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {effectiveMembers.map((entry) => {
              const member = memberByUserId.get(entry.userId);
              const inherited = entry.viaTeamId !== null;
              return (
                <div
                  key={entry.userId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar
                      className={`size-7 ${getAvatarTone(member?.userId, member?.user.email)}`}
                    >
                      <AvatarImage src={member?.user.image ?? ""} />
                      <AvatarFallback className="bg-transparent text-[10px]">
                        {getInitials(member?.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm">
                        {member?.user.name ?? "Organization member"}
                        {inherited ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground"
                            data-testid="member-via-subteam"
                            title={`Included in this team from sub-team "${entry.viaTeamName}"`}
                          >
                            <CornerDownRight aria-hidden className="size-2.5" />
                            from {entry.viaTeamName}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member?.user.email}
                      </p>
                    </div>
                  </div>
                  {/*
                    Inherited members cannot be removed HERE: their membership
                    lives on the sub-team, so removal happens there. Rendering
                    a dead remove button would imply otherwise.
                  */}
                  {!inherited ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${member?.user.name ?? "member"} from ${team.name}`}
                      disabled={changeMembership.isPending}
                      onClick={() =>
                        changeMembership.mutate({
                          userId: entry.userId,
                          remove: true,
                        })
                      }
                    >
                      <UserMinus className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
