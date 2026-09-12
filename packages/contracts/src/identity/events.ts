import { Schema } from "effect";
import {
	ApiKeyPublic,
	InvitationPublic,
	MemberPublic,
	OrganizationPublic,
	PrincipalPublic,
	RolePublic,
	TeamMemberPublic,
	TeamPublic,
	UserPublic,
} from "./http";

// Identity events are declared (not emitted) in this slice. All payloads use
// schema_version 1 and never carry secret/byte fields (avatar bytes, key material).
export const IDENTITY_SCHEMA_VERSION = 1;

const Id = Schema.String;

export const OrganizationUpserted = Schema.Struct({
	id: Id,
	row: OrganizationPublic,
});
export const MemberUpserted = Schema.Struct({ id: Id, row: MemberPublic });
export const RoleUpserted = Schema.Struct({ id: Id, row: RolePublic });
export const TeamUpserted = Schema.Struct({ id: Id, row: TeamPublic });
export const TeamMemberUpserted = Schema.Struct({
	id: Id,
	row: TeamMemberPublic,
});
export const InvitationUpserted = Schema.Struct({
	id: Id,
	row: InvitationPublic,
});
export const ApiKeyUpserted = Schema.Struct({ id: Id, row: ApiKeyPublic });
export const PrincipalUpserted = Schema.Struct({
	id: Id,
	row: PrincipalPublic,
});
export const UserUpserted = Schema.Struct({ id: Id, row: UserPublic });

export const MemberDeleted = Schema.Struct({ id: Id });
export const RoleDeleted = Schema.Struct({ id: Id });
export const TeamDeleted = Schema.Struct({ id: Id });
export const TeamMemberDeleted = Schema.Struct({ id: Id });
export const ApiKeyDeleted = Schema.Struct({ id: Id });

export const GrantUpserted = Schema.Struct({
	principalId: Id,
	capability: Id,
});
export const GrantDeleted = Schema.Struct({
	principalId: Id,
	capability: Id,
});

export const AvatarUpserted = Schema.Struct({
	userId: Id,
	avatarId: Id,
	updatedAt: Schema.String,
});

export const IdentityEventPayloadSchemas = {
	"identity:organization-upserted": OrganizationUpserted,
	"identity:member-upserted": MemberUpserted,
	"identity:role-upserted": RoleUpserted,
	"identity:team-upserted": TeamUpserted,
	"identity:team-member-upserted": TeamMemberUpserted,
	"identity:invitation-upserted": InvitationUpserted,
	"identity:apikey-upserted": ApiKeyUpserted,
	"identity:principal-upserted": PrincipalUpserted,
	"identity:user-upserted": UserUpserted,
	"identity:member-deleted": MemberDeleted,
	"identity:role-deleted": RoleDeleted,
	"identity:team-deleted": TeamDeleted,
	"identity:team-member-deleted": TeamMemberDeleted,
	"identity:apikey-deleted": ApiKeyDeleted,
	"identity:grant-upserted": GrantUpserted,
	"identity:grant-deleted": GrantDeleted,
	"identity:avatar-upserted": AvatarUpserted,
} as const;

export type IdentityEventType = keyof typeof IdentityEventPayloadSchemas;

export type IdentityEvent = {
	readonly [K in IdentityEventType]: {
		readonly type: K;
		readonly payload: Schema.Schema.Type<
			(typeof IdentityEventPayloadSchemas)[K]
		>;
	};
}[IdentityEventType];
