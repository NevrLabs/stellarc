import { Schema } from "effect";

// STL-18 §3 public DTO contracts. camelCase wire format (fork convention);
// storage stays snake_case. Strict: excess keys rejected. IDs are opaque
// nonempty strings ≤128; limits 1–200; dates ISO UTC. Public DTOs never
// include github_user_grant tokens or integration config secrets.

const Id = Schema.NonEmptyString.pipe(Schema.maxLength(128));
const IsoDate = Schema.Union(Schema.DateTimeUtcFromNumber, Schema.String);

const NullableString = Schema.NullOr(Schema.String);
const NullableBoolean = Schema.NullOr(Schema.Boolean);
const NullableDate = Schema.NullOr(Schema.String);
const NullableNumber = Schema.NullOr(Schema.Number);
const Json = Schema.NullOr(
	Schema.Array(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
);

export const RepoPublic = Schema.Struct({
	id: Id,
	organizationId: Id,
	provider: Schema.String,
	owner: Schema.String,
	name: Schema.String,
	externalId: NullableString,
	url: Schema.String,
	description: NullableString,
	defaultBranch: NullableString,
	isPrivate: NullableBoolean,
	config: NullableString,
	isActive: NullableBoolean,
	lastSyncedAt: NullableDate,
	openIssueCount: Schema.Number,
	openPullRequestCount: Schema.Number,
});
export type RepoPublic = typeof RepoPublic.Type;

export const RepoIssuePublic = Schema.Struct({
	id: Id,
	repoId: Id,
	number: Schema.Number,
	externalId: NullableString,
	title: Schema.String,
	body: NullableString,
	state: Schema.String,
	authorLogin: NullableString,
	authorAvatarUrl: NullableString,
	assigneeLogins: NullableString,
	labels: Json,
	commentCount: Schema.Number,
	url: Schema.String,
	externalCreatedAt: NullableDate,
	externalUpdatedAt: NullableDate,
	closedAt: NullableDate,
});
export type RepoIssuePublic = typeof RepoIssuePublic.Type;

export const RepoPullRequestPublic = Schema.Struct({
	id: Id,
	repoId: Id,
	number: Schema.Number,
	externalId: NullableString,
	title: Schema.String,
	body: NullableString,
	state: Schema.String,
	isDraft: NullableBoolean,
	authorLogin: NullableString,
	authorAvatarUrl: NullableString,
	headBranch: NullableString,
	baseBranch: NullableString,
	labels: Json,
	commentCount: Schema.Number,
	additions: NullableNumber,
	deletions: NullableNumber,
	changedFiles: NullableNumber,
	url: Schema.String,
	externalCreatedAt: NullableDate,
	externalUpdatedAt: NullableDate,
	mergedAt: NullableDate,
	closedAt: NullableDate,
});
export type RepoPullRequestPublic = typeof RepoPullRequestPublic.Type;

export const InstallationPublic = Schema.Struct({
	id: Id,
	organizationId: Id,
	installationId: Schema.Number,
	accountId: Schema.Number,
	accountLogin: Schema.String,
	accountType: Schema.String,
	accountAvatarUrl: NullableString,
	repositorySelection: NullableString,
	permissions: NullableString,
	createdAt: IsoDate,
	updatedAt: IsoDate,
});
export type InstallationPublic = typeof InstallationPublic.Type;

/** Self-only. Token material is never present on the wire. */
export const GrantPublic = Schema.Struct({
	id: Id,
	userId: Id,
	providerId: Schema.String,
	githubUserId: Schema.String,
	githubLogin: Schema.String,
	accessTokenExpiresAt: NullableDate,
	refreshTokenExpiresAt: NullableDate,
	scope: NullableString,
	createdAt: IsoDate,
	updatedAt: IsoDate,
});
export type GrantPublic = typeof GrantPublic.Type;

/**
 * Board-owned integration connection (safe surface). `config` is an opaque
 * redacted envelope: secrets stay server-side; consumers see only metadata.
 */
export const IntegrationPublic = Schema.Struct({
	id: Id,
	boardId: Id,
	type: Schema.String,
	isActive: NullableBoolean,
	createdAt: IsoDate,
	updatedAt: IsoDate,
});
export type IntegrationPublic = typeof IntegrationPublic.Type;

// --- Request bodies -------------------------------------------------------

export const CreateRepoInput = Schema.Struct({
	provider: Schema.String,
	owner: Schema.String,
	name: Schema.String,
	url: Schema.String,
	externalId: Schema.optional(NullableString),
	description: Schema.optional(NullableString),
	defaultBranch: Schema.optional(NullableString),
	isPrivate: Schema.optional(NullableBoolean),
	config: Schema.optional(NullableString),
	orgPrivilege: Schema.optional(NullableString),
});
export type CreateRepoInput = typeof CreateRepoInput.Type;

export const UpdateRepoInput = Schema.Struct({
	description: Schema.optional(NullableString),
	defaultBranch: Schema.optional(NullableString),
	isActive: Schema.optional(NullableBoolean),
	orgPrivilege: Schema.optional(NullableString),
	config: Schema.optional(NullableString),
});
export type UpdateRepoInput = typeof UpdateRepoInput.Type;

export const CreateInstallationInput = Schema.Struct({
	installationId: Schema.Number,
	accountId: Schema.Number,
	accountLogin: Schema.String,
	accountType: Schema.String,
	accountAvatarUrl: Schema.optional(NullableString),
	repositorySelection: Schema.optional(NullableString),
	permissions: Schema.optional(NullableString),
});
export type CreateInstallationInput = typeof CreateInstallationInput.Type;

export const PutIntegrationInput = Schema.Struct({
	boardId: Id,
	type: Schema.String,
	config: Schema.String,
	isActive: Schema.optional(NullableBoolean),
});
export type PutIntegrationInput = typeof PutIntegrationInput.Type;

export const ListReposQuery = Schema.Struct({
	provider: Schema.optional(Schema.String),
	active: Schema.optional(Schema.String),
});
export type ListReposQuery = typeof ListReposQuery.Type;

export const ListRepoItemsQuery = Schema.Struct({
	cursor: Schema.optional(Schema.String),
	limit: Schema.optional(Schema.String),
	state: Schema.optional(Schema.String),
});
export type ListRepoItemsQuery = typeof ListRepoItemsQuery.Type;
