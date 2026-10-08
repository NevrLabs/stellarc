import { Context, type Effect } from "effect";
import type { IdentityEvent } from "../../../contracts/src/identity/events";
import type {
	ApiKeyPublic,
	AvatarPublic,
	IdentityError,
	InvitationPublic,
	MemberPublic,
	OrganizationPublic,
	PrincipalPublic,
	RolePublic,
	TeamMemberPublic,
	TeamPublic,
	UserPublic,
} from "../../../contracts/src/identity/http";

// Identity service interfaces (Services only — no Layer, no SQL). Signatures reference
// the contract Schemas; implementations are T1 (#15) app work.

export class IdentityStore extends Context.Service<
	IdentityStore,
	{
		readonly userById: (id: string) => Effect.Effect<UserPublic, IdentityError>;
		readonly organizationById: (
			id: string,
		) => Effect.Effect<OrganizationPublic, IdentityError>;
		readonly listOrganizations: () => Effect.Effect<
			ReadonlyArray<OrganizationPublic>,
			IdentityError
		>;
		readonly listMembers: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<MemberPublic>, IdentityError>;
		readonly listRoles: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<RolePublic>, IdentityError>;
		readonly listTeams: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<TeamPublic>, IdentityError>;
		readonly listTeamMembers: (
			teamId: string,
		) => Effect.Effect<ReadonlyArray<TeamMemberPublic>, IdentityError>;
		readonly listInvitations: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<InvitationPublic>, IdentityError>;
		readonly listApiKeys: (
			orgId: string,
		) => Effect.Effect<ReadonlyArray<ApiKeyPublic>, IdentityError>;
		readonly avatarByUserId: (
			userId: string,
		) => Effect.Effect<AvatarPublic, IdentityError>;
	}
>()("stellarc/IdentityStore") {}

export class OrgRouter extends Context.Service<
	OrgRouter,
	{
		readonly resolve: (
			orgId: string,
		) => Effect.Effect<
			{ readonly schema: "public"; readonly orgId: string },
			IdentityError
		>;
	}
>()("stellarc/OrgRouter") {}

export class PrincipalResolver extends Context.Service<
	PrincipalResolver,
	{
		readonly resolve: (
			actor: unknown,
		) => Effect.Effect<PrincipalPublic, IdentityError>;
	}
>()("stellarc/PrincipalResolver") {}

export class IdentityEvents extends Context.Service<
	IdentityEvents,
	{
		readonly append: (
			event: IdentityEvent,
		) => Effect.Effect<void, IdentityError>;
	}
>()("stellarc/IdentityEvents") {}
