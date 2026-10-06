import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import {
	CreateInstallationInput,
	CreateRepoInput,
	GrantPublic,
	InstallationPublic,
	IntegrationPublic,
	PutIntegrationInput,
	RepoIssuePublic,
	RepoPublic,
	RepoPullRequestPublic,
	UpdateRepoInput,
} from "./repository";

// STL-18 §3: repository HTTP surface. Same error union and mutation envelope
// convention as identity; IDs are opaque ≤128; strict schemas; secrets never
// appear on the wire.

const ID = Schema.NonEmptyString.pipe(Schema.maxLength(128));
const PathOrg = Schema.Struct({ org: ID });
const PathOrgId = Schema.Struct({ org: ID, id: ID });
const PathOrgRepo = Schema.Struct({ org: ID, repo: ID });

export const RepositoryError = Schema.Union(
	Schema.Struct({
		_tag: Schema.Literal("ValidationError"),
		message: Schema.String,
	}),
	Schema.Struct({ _tag: Schema.Literal("Unauthenticated") }),
	Schema.Struct({ _tag: Schema.Literal("Forbidden") }),
	Schema.Struct({ _tag: Schema.Literal("NotFound") }),
	Schema.Struct({
		_tag: Schema.Literal("Conflict"),
		code: Schema.Literal("Duplicate", "StaleWrite", "InvalidReference"),
	}),
	Schema.Struct({
		_tag: Schema.Literal("RateLimited"),
		retryAfterSeconds: Schema.Number,
	}),
	Schema.Struct({ _tag: Schema.Literal("Unavailable") }),
);
export type RepositoryError = Schema.Schema.Type<typeof RepositoryError>;

export const Mutation = <A, I>(data: Schema.Schema<A, I>) =>
	Schema.Struct({ data, txid: Schema.Number });
export const DeletedId = Schema.Struct({ id: Schema.String });

const ListRepos = HttpApiEndpoint.get(
	"list-repos",
	"/api/identity/orgs/:org/repos",
)
	.setPath(PathOrg)
	.addSuccess(Schema.Struct({ repos: Schema.Array(RepoPublic) }))
	.addError(RepositoryError);

const CreateRepo = HttpApiEndpoint.post(
	"create-repo",
	"/api/identity/orgs/:org/repos",
)
	.setPath(PathOrg)
	.setPayload(CreateRepoInput)
	.addSuccess(Mutation(RepoPublic))
	.addError(RepositoryError);

const UpdateRepo = HttpApiEndpoint.patch(
	"update-repo",
	"/api/identity/orgs/:org/repos/:id",
)
	.setPath(PathOrgId)
	.setPayload(UpdateRepoInput)
	.addSuccess(Mutation(RepoPublic))
	.addError(RepositoryError);

const DeleteRepo = HttpApiEndpoint.del(
	"delete-repo",
	"/api/identity/orgs/:org/repos/:id",
)
	.setPath(PathOrgId)
	.addSuccess(Mutation(DeletedId))
	.addError(RepositoryError);

const ListIssues = HttpApiEndpoint.get(
	"list-issues",
	"/api/identity/orgs/:org/repos/:repo/issues",
)
	.setPath(PathOrgRepo)
	.addSuccess(
		Schema.Struct({
			items: Schema.Array(RepoIssuePublic),
			nextCursor: Schema.NullOr(Schema.String),
		}),
	)
	.addError(RepositoryError);

const ListPulls = HttpApiEndpoint.get(
	"list-pulls",
	"/api/identity/orgs/:org/repos/:repo/pulls",
)
	.setPath(PathOrgRepo)
	.addSuccess(
		Schema.Struct({
			items: Schema.Array(RepoPullRequestPublic),
			nextCursor: Schema.NullOr(Schema.String),
		}),
	)
	.addError(RepositoryError);

const ListInstallations = HttpApiEndpoint.get(
	"list-installations",
	"/api/identity/orgs/:org/github/installations",
)
	.setPath(PathOrg)
	.addSuccess(
		Schema.Struct({ installations: Schema.Array(InstallationPublic) }),
	)
	.addError(RepositoryError);

const CreateInstallation = HttpApiEndpoint.post(
	"create-installation",
	"/api/identity/orgs/:org/github/installations",
)
	.setPath(PathOrg)
	.setPayload(CreateInstallationInput)
	.addSuccess(Mutation(InstallationPublic))
	.addError(RepositoryError);

const DeleteInstallation = HttpApiEndpoint.del(
	"delete-installation",
	"/api/identity/orgs/:org/github/installations/:id",
)
	.setPath(PathOrgId)
	.addSuccess(Mutation(DeletedId))
	.addError(RepositoryError);

const ListGrants = HttpApiEndpoint.get(
	"list-grants",
	"/api/identity/github/grants",
)
	.addSuccess(Schema.Struct({ grants: Schema.Array(GrantPublic) }))
	.addError(RepositoryError);

const DeleteGrant = HttpApiEndpoint.del(
	"delete-grant",
	"/api/identity/github/grants/:id",
)
	.setPath(Schema.Struct({ id: ID }))
	.addSuccess(Mutation(DeletedId))
	.addError(RepositoryError);

const ListIntegrations = HttpApiEndpoint.get(
	"list-integrations",
	"/api/identity/orgs/:org/integrations",
)
	.setPath(PathOrg)
	.addSuccess(Schema.Struct({ integrations: Schema.Array(IntegrationPublic) }))
	.addError(RepositoryError);

const PutIntegration = HttpApiEndpoint.put(
	"put-integration",
	"/api/identity/orgs/:org/integrations",
)
	.setPath(PathOrg)
	.setPayload(PutIntegrationInput)
	.addSuccess(Mutation(IntegrationPublic))
	.addError(RepositoryError);

const DeleteIntegration = HttpApiEndpoint.del(
	"delete-integration",
	"/api/identity/orgs/:org/integrations/:id",
)
	.setPath(PathOrgId)
	.addSuccess(Mutation(DeletedId))
	.addError(RepositoryError);

export const RepositoryApiGroup = HttpApiGroup.make("repository")
	.add(ListRepos)
	.add(CreateRepo)
	.add(UpdateRepo)
	.add(DeleteRepo)
	.add(ListIssues)
	.add(ListPulls)
	.add(ListInstallations)
	.add(CreateInstallation)
	.add(DeleteInstallation)
	.add(ListGrants)
	.add(DeleteGrant)
	.add(ListIntegrations)
	.add(PutIntegration)
	.add(DeleteIntegration);
