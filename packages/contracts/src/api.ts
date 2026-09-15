import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { Health, Rank } from "./projects";

const Id = Schema.NonEmptyString.pipe(Schema.maxLength(128));
const NullString = Schema.NullOr(Schema.String);

const PathOrg = Schema.Struct({ organizationId: Id });
const PathProject = Schema.Struct({ projectId: Id });
const PathMilestone = Schema.Struct({ projectId: Id, milestoneId: Id });
const PathUpdate = Schema.Struct({ projectId: Id, updateId: Id });

const CreateProjectPayload = Schema.Struct({
	organizationId: Id,
	name: Schema.NonEmptyString.pipe(Schema.maxLength(255)),
	summary: Schema.String,
	leadUserId: Id,
	leadTeamId: Schema.NullOr(Id),
	slug: NullString,
	status: Schema.NullOr(
		Schema.Literal("planned", "started", "completed", "canceled"),
	),
	priority: Schema.NullOr(
		Schema.Literal("no-priority", "low", "medium", "high", "urgent"),
	),
	icon: NullString,
	color: NullString,
	description: NullString,
	successCriteria: NullString,
	startDate: NullString,
	targetDate: NullString,
});

const UpdateProjectPayload = Schema.Struct({
	name: Schema.NonEmptyString.pipe(Schema.maxLength(255)),
	summary: Schema.String,
	status: Schema.Literal("planned", "started", "completed", "canceled"),
	priority: Schema.NullOr(
		Schema.Literal("no-priority", "low", "medium", "high", "urgent"),
	),
	icon: NullString,
	color: NullString,
	description: NullString,
	successCriteria: NullString,
	leadUserId: Id,
	leadTeamId: Schema.NullOr(Id),
	startDate: NullString,
	targetDate: NullString,
	orgPrivilege: Schema.NullOr(Schema.Literal("none", "view", "edit", "manage")),
});

const ResolveQuery = Schema.Struct({ organizationId: Id, slug: Schema.String });
const ListQuery = Schema.Struct({
	organizationId: Id,
	includeArchived: Schema.optional(Schema.String),
});
const SlugPayload = Schema.Struct({ slug: Schema.String });

const CreateMilestonePayload = Schema.Struct({
	name: Schema.NonEmptyString.pipe(Schema.maxLength(255)),
	description: NullString,
	targetDate: NullString,
	rank: Schema.NullOr(Rank),
});
const UpdateMilestonePayload = Schema.Struct({
	name: NullString,
	description: NullString,
	targetDate: NullString,
	rank: Schema.NullOr(Rank),
});
const CreateUpdatePayload = Schema.Struct({
	content: Schema.NonEmptyString,
	health: Health,
});
const UpdateUpdatePayload = Schema.Struct({
	content: NullString,
	health: Schema.NullOr(Health),
});

const listProjects = HttpApiEndpoint.get(
	"listProjects",
	"/api/project",
).setUrlParams(ListQuery);
const createProject = HttpApiEndpoint.post(
	"createProject",
	"/api/project",
).setPayload(CreateProjectPayload);
const resolveProject = HttpApiEndpoint.get(
	"resolveProject",
	"/api/project/resolve",
).setUrlParams(ResolveQuery);
const getProject = HttpApiEndpoint.get(
	"getProject",
	"/api/project/:projectId",
).setPath(PathProject);
const updateProject = HttpApiEndpoint.put(
	"updateProject",
	"/api/project/:projectId",
)
	.setPath(PathProject)
	.setPayload(UpdateProjectPayload);
const renameProjectSlug = HttpApiEndpoint.put(
	"renameProjectSlug",
	"/api/project/:projectId/slug",
)
	.setPath(PathProject)
	.setPayload(SlugPayload);
const archiveProject = HttpApiEndpoint.put(
	"archiveProject",
	"/api/project/:projectId/archive",
).setPath(PathProject);
const unarchiveProject = HttpApiEndpoint.put(
	"unarchiveProject",
	"/api/project/:projectId/unarchive",
).setPath(PathProject);
const listMilestones = HttpApiEndpoint.get(
	"listMilestones",
	"/api/project/:projectId/milestones",
).setPath(PathProject);
const createMilestone = HttpApiEndpoint.post(
	"createMilestone",
	"/api/project/:projectId/milestones",
)
	.setPath(PathProject)
	.setPayload(CreateMilestonePayload);
const updateMilestone = HttpApiEndpoint.put(
	"updateMilestone",
	"/api/project/:projectId/milestones/:milestoneId",
)
	.setPath(PathMilestone)
	.setPayload(UpdateMilestonePayload);
const deleteMilestone = HttpApiEndpoint.del(
	"deleteMilestone",
	"/api/project/:projectId/milestones/:milestoneId",
).setPath(PathMilestone);
const completeMilestone = HttpApiEndpoint.put(
	"completeMilestone",
	"/api/project/:projectId/milestones/:milestoneId/complete",
).setPath(PathMilestone);
const reopenMilestone = HttpApiEndpoint.put(
	"reopenMilestone",
	"/api/project/:projectId/milestones/:milestoneId/reopen",
).setPath(PathMilestone);
const listUpdates = HttpApiEndpoint.get(
	"listUpdates",
	"/api/project/:projectId/updates",
).setPath(PathProject);
const createUpdate = HttpApiEndpoint.post(
	"createUpdate",
	"/api/project/:projectId/updates",
)
	.setPath(PathProject)
	.setPayload(CreateUpdatePayload);
const updateUpdate = HttpApiEndpoint.put(
	"updateUpdate",
	"/api/project/:projectId/updates/:updateId",
)
	.setPath(PathUpdate)
	.setPayload(UpdateUpdatePayload);
const deleteUpdate = HttpApiEndpoint.del(
	"deleteUpdate",
	"/api/project/:projectId/updates/:updateId",
).setPath(PathUpdate);

export const FoundationApi = HttpApi.make("foundation")
	.add(
		HttpApiGroup.make("foundation")
			.add(
				HttpApiEndpoint.get("health", "/health").addSuccess(
					Schema.Struct({ status: Schema.Literal("ok") }),
				),
			)
			.add(
				HttpApiEndpoint.get("shape", "/orgs/:org/v1/shape").setPath(
					Schema.Struct({
						org: Schema.NonEmptyString.pipe(Schema.maxLength(128)),
					}),
				),
			),
	)
	.add(
		HttpApiGroup.make("projects")
			.add(listProjects)
			.add(createProject)
			.add(resolveProject)
			.add(getProject)
			.add(updateProject)
			.add(renameProjectSlug)
			.add(archiveProject)
			.add(unarchiveProject)
			.add(listMilestones)
			.add(createMilestone)
			.add(updateMilestone)
			.add(deleteMilestone)
			.add(completeMilestone)
			.add(reopenMilestone)
			.add(listUpdates)
			.add(createUpdate)
			.add(updateUpdate)
			.add(deleteUpdate),
	);
