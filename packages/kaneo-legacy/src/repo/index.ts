import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { assetTable } from "../database/schema";
import { listAccessibleResourceIds } from "../resource-access";
import {
  assertRepoMediaKeyMatchesContext,
  createRepoMediaUploadUrl,
  isImageContentType,
  validateTaskAssetUploadInput,
} from "../storage/s3";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import {
  addSyncedTask,
  unsyncTaskFromIssue,
} from "./controllers/add-synced-task";
import { createGithubRepo } from "./controllers/create-github-repo";
import createRepoCtrl from "./controllers/create-repo";
import { createSyncedIssueForTask } from "./controllers/create-synced-issue-for-task";
import deleteRepoCtrl from "./controllers/delete-repo";
import { getGitHubRepoContents } from "./controllers/get-github-repo-contents";
import { getGitHubRepoTree } from "./controllers/get-github-repo-tree";
import getRepoCtrl from "./controllers/get-repo";
import { getRepoIssue } from "./controllers/get-repo-issue";
import { getRepoPullRequest } from "./controllers/get-repo-pull-request";
import { getRepoPullRequestChecks } from "./controllers/get-repo-pull-request-checks";
import { getRepoPullRequestCommits } from "./controllers/get-repo-pull-request-commits";
import { getRepoPullRequestFiles } from "./controllers/get-repo-pull-request-files";
import {
  addGitHubSubIssue,
  closeGitHubIssue,
  createGitHubMilestone,
  listGitHubMilestones,
  markGitHubIssueDuplicate,
  removeGitHubSubIssue,
  reopenGitHubIssue,
  unmarkGitHubIssueDuplicate,
  updateGitHubMilestone,
} from "./controllers/github-issue-management";
import {
  createGitHubPullRequestReview,
  listGitHubPullRequestReviews,
  REVIEW_EVENTS,
  replyToGitHubReviewComment,
} from "./controllers/github-pull-request-reviews";
import { getGitHubRepoMetadata } from "./controllers/github-repo-metadata";
import {
  listGitHubRepoPackages,
  listGitHubRepoReleases,
} from "./controllers/list-github-repo-resources";
import listRepoIssuesCtrl from "./controllers/list-repo-issues";
import listRepoPullRequestsCtrl from "./controllers/list-repo-pull-requests";
import listReposCtrl from "./controllers/list-repos";
import {
  createGitHubItemComment,
  mergeGitHubPullRequest,
  updateGitHubItem,
} from "./controllers/manage-github-repo";
import { toRepoResponse, toRepoResponses } from "./controllers/repo-response";
import {
  addRepoItemTaskLink,
  removeRepoItemTaskLink,
} from "./controllers/repo-task-links";
import { syncTaskFromIssue } from "./controllers/sync-task-from-issue";
import updateRepoCtrl from "./controllers/update-repo";
import { repoOrganizationAccess } from "./repo-organization-access";
import { areReposEnabled, requireReposEnabled } from "./require-repos-enabled";
import { syncRepo } from "./services/sync-gitea-repo";

// NOTE: the permission statement vocabulary in @kaneo/permissions is
// `board` | `task` | `label` | `organization` — there is no `repo` verb yet.
// Until one is added, repo writes reuse the `board` create/update verbs so
// existing roles (viewer read-only, member create, admin full) keep working.
// Reads only require organization membership, same as boards.

const repoSchema = v.object({
  id: v.string(),
  organizationId: v.string(),
  provider: v.string(),
  owner: v.string(),
  name: v.string(),
  externalId: v.nullable(v.string()),
  url: v.string(),
  description: v.nullable(v.string()),
  defaultBranch: v.nullable(v.string()),
  isPrivate: v.boolean(),
  config: v.nullable(v.record(v.string(), v.unknown())),
  isActive: v.boolean(),
  lastSyncedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

const repoWithCountsSchema = v.object({
  ...repoSchema.entries,
  openIssueCount: v.number(),
  openPullRequestCount: v.number(),
});

const paginationSchema = v.object({
  total: v.number(),
  page: v.number(),
  pageSize: v.number(),
  totalPages: v.number(),
});

const repoIssueSchema = v.object({
  id: v.string(),
  repoId: v.string(),
  number: v.number(),
  externalId: v.nullable(v.string()),
  title: v.string(),
  body: v.nullable(v.string()),
  state: v.string(),
  authorLogin: v.nullable(v.string()),
  authorAvatarUrl: v.nullable(v.string()),
  assigneeLogins: v.nullable(v.array(v.string())),
  labels: v.nullable(
    v.array(v.object({ name: v.string(), color: v.optional(v.string()) })),
  ),
  commentCount: v.number(),
  url: v.string(),
  externalCreatedAt: v.nullable(v.date()),
  externalUpdatedAt: v.nullable(v.date()),
  closedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

const repoItemUpdateSchema = v.object({
  title: v.optional(v.string()),
  body: v.optional(v.nullable(v.string())),
  state: v.optional(v.picklist(["open", "closed"] as const)),
  labels: v.optional(v.array(v.string())),
  assignees: v.optional(v.array(v.string())),
  milestone: v.optional(v.nullable(v.number())),
});

const repoPullRequestSchema = v.object({
  id: v.string(),
  repoId: v.string(),
  number: v.number(),
  externalId: v.nullable(v.string()),
  title: v.string(),
  body: v.nullable(v.string()),
  state: v.string(),
  isDraft: v.boolean(),
  authorLogin: v.nullable(v.string()),
  authorAvatarUrl: v.nullable(v.string()),
  headBranch: v.nullable(v.string()),
  baseBranch: v.nullable(v.string()),
  labels: v.nullable(
    v.array(v.object({ name: v.string(), color: v.optional(v.string()) })),
  ),
  commentCount: v.number(),
  url: v.string(),
  externalCreatedAt: v.nullable(v.date()),
  externalUpdatedAt: v.nullable(v.date()),
  mergedAt: v.nullable(v.date()),
  closedAt: v.nullable(v.date()),
  createdAt: v.date(),
  updatedAt: v.date(),
});

const githubRepoMetadataSchema = v.object({
  labels: v.array(
    v.object({
      name: v.string(),
      color: v.string(),
      description: v.nullable(v.string()),
    }),
  ),
  assignableUsers: v.array(
    v.object({ login: v.string(), avatarUrl: v.string() }),
  ),
  milestones: v.array(
    v.object({
      number: v.number(),
      title: v.string(),
      state: v.string(),
      dueOn: v.nullable(v.string()),
    }),
  ),
});

const githubRepoContentsSchema = v.object({
  path: v.string(),
  ref: v.nullable(v.string()),
  type: v.picklist(["directory", "file", "symlink", "submodule"] as const),
  entries: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      type: v.picklist(["file", "dir", "symlink", "submodule"] as const),
      size: v.number(),
      sha: v.string(),
    }),
  ),
  file: v.nullable(
    v.object({
      name: v.string(),
      path: v.string(),
      size: v.number(),
      sha: v.string(),
      content: v.nullable(v.string()),
      isBinary: v.boolean(),
    }),
  ),
});

const githubRepoTreeSchema = v.object({
  entries: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      type: v.picklist(["file", "dir", "symlink", "submodule"] as const),
      size: v.number(),
      sha: v.string(),
    }),
  ),
  ref: v.string(),
  truncated: v.boolean(),
});

const githubReleaseSchema = v.object({
  id: v.number(),
  tagName: v.string(),
  name: v.nullable(v.string()),
  body: v.nullable(v.string()),
  publishedAt: v.nullable(v.string()),
  createdAt: v.string(),
  isDraft: v.boolean(),
  isPrerelease: v.boolean(),
  url: v.string(),
  assets: v.array(
    v.object({
      id: v.number(),
      name: v.string(),
      size: v.number(),
      downloadUrl: v.string(),
      downloadCount: v.number(),
    }),
  ),
});
const githubPackageSchema = v.object({
  id: v.number(),
  name: v.string(),
  packageType: v.string(),
  visibility: v.string(),
  url: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  versionCount: v.number(),
});

const pullRequestFilesSchema = v.object({
  files: v.array(
    v.object({
      filename: v.string(),
      status: v.string(),
      additions: v.number(),
      deletions: v.number(),
      changes: v.number(),
      patch: v.nullable(v.string()),
    }),
  ),
  totals: v.object({
    additions: v.number(),
    deletions: v.number(),
    changedFiles: v.number(),
  }),
});

const pullRequestCommitsSchema = v.object({
  commits: v.array(
    v.object({
      sha: v.string(),
      message: v.string(),
      authorLogin: v.nullable(v.string()),
      authorAvatarUrl: v.nullable(v.string()),
      committedAt: v.nullable(v.string()),
      url: v.string(),
    }),
  ),
});

const pullRequestCheckEntrySchema = v.object({
  name: v.string(),
  status: v.string(),
  conclusion: v.nullable(v.string()),
  startedAt: v.nullable(v.string()),
  completedAt: v.nullable(v.string()),
  url: v.string(),
});

const pullRequestChecksSchema = v.object({
  conclusion: v.nullable(v.string()),
  headSha: v.string(),
  checks: v.array(pullRequestCheckEntrySchema),
  runs: v.array(pullRequestCheckEntrySchema),
  unavailable: v.array(v.picklist(["checks", "runs"])),
});

// GitHub caps a PR's number at a positive integer; reject anything else before
// spending an installation token on a request that cannot succeed.
const pullRequestParamSchema = v.object({
  id: v.string(),
  number: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
});

const repo = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listRepos",
      tags: ["Repos"],
      description: "Get all repos in a organization",
      responses: {
        200: {
          description: "List of repos with open issue and pull request counts",
          content: {
            "application/json": {
              schema: resolver(v.array(repoWithCountsSchema)),
            },
          },
        },
      },
    }),
    validator(
      "query",
      v.object({ organizationId: v.string(), teamId: v.optional(v.string()) }),
    ),
    organizationAccess.fromQuery(),
    async (c) => {
      const organizationId = c.get("organizationId");
      const { teamId } = c.req.valid("query");
      // A disabled feature is an empty list, not a missing resource. Mutating
      // routes below still hard-fail via requireReposEnabled.
      if (!(await areReposEnabled(organizationId))) {
        return c.json([]);
      }
      const repos = await listReposCtrl(organizationId);
      const accessibleIds = new Set(
        await listAccessibleResourceIds({
          organizationId,
          resourceType: "repo",
          userId: c.get("userId"),
          resourceIds: repos.map((repo) => repo.id),
          teamId,
        }),
      );
      return c.json(
        toRepoResponses(repos.filter((repo) => accessibleIds.has(repo.id))),
      );
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createRepo",
      tags: ["Repos"],
      description: "Connect a new repo to a organization",
      responses: {
        200: {
          description: "Repo created successfully",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator(
      "json",
      v.pipe(
        v.object({
          organizationId: v.string(),
          // Forgejo is API-compatible with Gitea and rides the same branch.
          provider: v.picklist(["github", "gitea"] as const),
          owner: v.string(),
          name: v.string(),
          // GitHub resolves the canonical URL from the installation, so the
          // client cannot supply it; self-hosted Gitea/Forgejo must.
          url: v.optional(v.string()),
          externalId: v.optional(v.string()),
          description: v.optional(v.string()),
          defaultBranch: v.optional(v.string()),
          isPrivate: v.optional(v.boolean()),
          config: v.optional(v.record(v.string(), v.unknown())),
          installationId: v.optional(v.number()),
        }),
        v.forward(
          v.check(
            (input) => input.provider !== "gitea" || Boolean(input.url),
            "url is required for Gitea and Forgejo repositories",
          ),
          ["url"],
        ),
        v.forward(
          v.check(
            (input) =>
              input.provider !== "github" ||
              typeof input.installationId === "number",
            "installationId is required for GitHub repositories",
          ),
          ["installationId"],
        ),
      ),
    ),
    organizationAccess.fromBody(),
    requireReposEnabled,
    // No `repo` permission verb exists yet — reuse `board: ["create"]`.
    requireOrganizationPermission({ board: ["create"] }),
    async (c) => {
      const body = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const newRepo =
        body.provider === "github"
          ? await createGithubRepo({
              organizationId,
              installationId: body.installationId as number,
              owner: body.owner,
              name: body.name,
            })
          : await createRepoCtrl({
              organizationId,
              provider: body.provider,
              owner: body.owner,
              name: body.name,
              url: body.url as string,
              externalId: body.externalId,
              description: body.description,
              defaultBranch: body.defaultBranch,
              isPrivate: body.isPrivate,
              config: body.config,
            });
      return c.json(toRepoResponse(newRepo));
    },
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "getRepo",
      tags: ["Repos"],
      description: "Get a specific repo by ID",
      responses: {
        200: {
          description: "Repo details",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const repoData = await getRepoCtrl(id, organizationId);
      return c.json(toRepoResponse(repoData));
    },
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "updateRepo",
      tags: ["Repos"],
      description: "Update an existing repo",
      responses: {
        200: {
          description: "Repo updated successfully",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        isActive: v.optional(v.boolean()),
        config: v.optional(
          v.object({ icon: v.optional(v.nullable(v.string())) }),
        ),
        installationId: v.optional(v.number()),
      }),
    ),
    repoOrganizationAccess(),
    // No `repo` permission verb exists yet — reuse `board: ["update"]`.
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const updates = c.req.valid("json");
      const organizationId = c.get("organizationId");
      const updatedRepo = await updateRepoCtrl(id, organizationId, updates);
      return c.json(toRepoResponse(updatedRepo));
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteRepo",
      tags: ["Repos"],
      description:
        "Delete a repo by ID — cascades to its issues and pull requests",
      responses: {
        200: {
          description: "Repo deleted successfully",
          content: {
            "application/json": { schema: resolver(repoSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    // No `repo` permission verb exists yet — reuse `board: ["update"]`.
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      const deletedRepo = await deleteRepoCtrl(id, organizationId);
      return c.json(toRepoResponse(deletedRepo));
    },
  )
  .get(
    "/:id/contents",
    describeRoute({
      operationId: "getGitHubRepoContents",
      tags: ["Repos"],
      description:
        "Browse a GitHub repository directory or read a text file through its installation",
      responses: {
        200: {
          description: "Repository directory entries or file content",
          content: {
            "application/json": { schema: resolver(githubRepoContentsSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          path: v.optional(v.pipe(v.string(), v.maxLength(4096))),
          ref: v.optional(v.pipe(v.string(), v.maxLength(512))),
        }),
      ),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const { path = "", ref } = c.req.valid("query") || {};
      return c.json(await getGitHubRepoContents({ repoId: id, path, ref }));
    },
  )
  .get(
    "/:id/tree",
    describeRoute({
      operationId: "getGitHubRepoTree",
      tags: ["Repos"],
      description:
        "Preload a GitHub repository's recursive tree for local file-explorer expansion",
      responses: {
        200: {
          description:
            "Recursive repository tree; truncated trees require lazy browsing",
          content: {
            "application/json": { schema: resolver(githubRepoTreeSchema) },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({ ref: v.optional(v.pipe(v.string(), v.maxLength(512))) }),
      ),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const { ref } = c.req.valid("query") || {};
      return c.json(await getGitHubRepoTree({ repoId: id, ref }));
    },
  )
  .get(
    "/:id/issues/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(v.string(), v.transform(Number)),
      }),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(await getRepoIssue(id, number, c.get("organizationId")));
    },
  )
  .get(
    "/:id/pull-requests/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(v.string(), v.transform(Number)),
      }),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await getRepoPullRequest(id, number, c.get("organizationId")),
      );
    },
  )
  .get(
    "/:id/issues",
    describeRoute({
      operationId: "listRepoIssues",
      tags: ["Repos"],
      description: "Get mirrored issues for a repo, newest number first",
      responses: {
        200: {
          description: "Paginated list of repo issues",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  data: v.array(repoIssueSchema),
                  pagination: paginationSchema,
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          state: v.optional(v.picklist(["open", "closed", "all"] as const)),
          page: v.optional(v.pipe(v.string(), v.transform(Number))),
          limit: v.optional(v.pipe(v.string(), v.transform(Number))),
        }),
      ),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const filters = c.req.valid("query") || {};
      const organizationId = c.get("organizationId");
      const issues = await listRepoIssuesCtrl(id, organizationId, filters);
      return c.json(issues);
    },
  )
  .get(
    "/:id/pull-requests",
    describeRoute({
      operationId: "listRepoPullRequests",
      tags: ["Repos"],
      description: "Get mirrored pull requests for a repo, newest number first",
      responses: {
        200: {
          description: "Paginated list of repo pull requests",
          content: {
            "application/json": {
              schema: resolver(
                v.object({
                  data: v.array(repoPullRequestSchema),
                  pagination: paginationSchema,
                }),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.optional(
        v.object({
          state: v.optional(
            v.picklist(["open", "closed", "merged", "all"] as const),
          ),
          page: v.optional(v.pipe(v.string(), v.transform(Number))),
          limit: v.optional(v.pipe(v.string(), v.transform(Number))),
        }),
      ),
    ),
    repoOrganizationAccess(),
    async (c) => {
      const { id } = c.req.valid("param");
      const filters = c.req.valid("query") || {};
      const organizationId = c.get("organizationId");
      const pullRequests = await listRepoPullRequestsCtrl(
        id,
        organizationId,
        filters,
      );
      return c.json(pullRequests);
    },
  )
  .get(
    "/:id/pull-requests/:number/files",
    describeRoute({
      operationId: "getRepoPullRequestFiles",
      tags: ["Repos"],
      description: "Get changed files and patches for a GitHub pull request",
      responses: {
        200: {
          description: "Pull request files with aggregate change counts",
          content: {
            "application/json": { schema: resolver(pullRequestFilesSchema) },
          },
        },
      },
    }),
    validator("param", pullRequestParamSchema),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(await getRepoPullRequestFiles({ repoId: id, number }));
    },
  )
  .get(
    "/:id/pull-requests/:number/commits",
    describeRoute({
      operationId: "getRepoPullRequestCommits",
      tags: ["Repos"],
      description: "Get the live commit history for a GitHub pull request",
      responses: {
        200: {
          description: "Pull request commits",
          content: {
            "application/json": { schema: resolver(pullRequestCommitsSchema) },
          },
        },
      },
    }),
    validator("param", pullRequestParamSchema),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(await getRepoPullRequestCommits({ repoId: id, number }));
    },
  )
  .get(
    "/:id/pull-requests/:number/checks",
    describeRoute({
      operationId: "getRepoPullRequestChecks",
      tags: ["Repos"],
      description:
        "Get live GitHub check runs and Actions workflow runs for a pull request",
      responses: {
        200: {
          description: "Pull request CI check and workflow run state",
          content: {
            "application/json": { schema: resolver(pullRequestChecksSchema) },
          },
        },
      },
    }),
    validator("param", pullRequestParamSchema),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(await getRepoPullRequestChecks({ repoId: id, number }));
    },
  )
  .get(
    "/:id/pull-requests/:number/reviews",
    describeRoute({
      operationId: "getRepoPullRequestReviews",
      tags: ["Repos"],
      description:
        "List submitted GitHub reviews and inline review comments for a pull request",
    }),
    validator("param", pullRequestParamSchema),
    repoOrganizationAccess(),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await listGitHubPullRequestReviews({
          repoId: id,
          number,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/pull-requests/:number/reviews",
    describeRoute({
      operationId: "createRepoPullRequestReview",
      tags: ["Repos"],
      description:
        "Submit an approval, change request, or review comment as the acting member",
    }),
    validator("param", pullRequestParamSchema),
    validator(
      "json",
      v.object({
        event: v.picklist(REVIEW_EVENTS),
        body: v.optional(v.string()),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      const { event, body } = c.req.valid("json");
      return c.json(
        await createGitHubPullRequestReview({
          repoId: id,
          number,
          event,
          body,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/pull-requests/:number/review-comments/:commentId/replies",
    describeRoute({
      operationId: "replyToRepoPullRequestReviewComment",
      tags: ["Repos"],
      description: "Reply to an inline GitHub review comment thread",
    }),
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
        commentId: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", v.object({ body: v.pipe(v.string(), v.minLength(1)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number, commentId } = c.req.valid("param");
      return c.json(
        await replyToGitHubReviewComment({
          repoId: id,
          number,
          commentId,
          body: c.req.valid("json").body,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/:itemType/:number/task-links",
    validator(
      "param",
      v.object({
        id: v.string(),
        itemType: v.picklist(["issues", "pull-requests"] as const),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", v.object({ taskId: v.string() })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, itemType, number } = c.req.valid("param");
      const link = await addRepoItemTaskLink({
        repoId: id,
        number,
        taskId: c.req.valid("json").taskId,
        itemType: itemType === "issues" ? "issue" : "pullRequest",
        organizationId: c.get("organizationId"),
      });
      return c.json(link);
    },
  )
  .delete(
    "/:id/:itemType/:number/task-links/:taskId",
    validator(
      "param",
      v.object({
        id: v.string(),
        itemType: v.picklist(["issues", "pull-requests"] as const),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
        taskId: v.string(),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, itemType, number, taskId } = c.req.valid("param");
      return c.json(
        await removeRepoItemTaskLink({
          repoId: id,
          number,
          taskId,
          itemType: itemType === "issues" ? "issue" : "pullRequest",
          organizationId: c.get("organizationId"),
        }),
      );
    },
  )
  .put(
    "/:id/media-upload",
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
        surface: v.picklist(["description", "comment"] as const),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      try {
        validateTaskAssetUploadInput(input.contentType, input.size);
        return c.json(
          await createRepoMediaUploadUrl({
            organizationId: c.get("organizationId"),
            repoId: id,
            surface: input.surface,
            filename: input.filename,
            contentType: input.contentType,
          }),
        );
      } catch (error) {
        throw new Error(
          error instanceof Error ? error.message : "Invalid upload",
        );
      }
    },
  )
  .post(
    "/:id/media-upload/finalize",
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        key: v.string(),
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
        surface: v.picklist(["description", "comment"] as const),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      validateTaskAssetUploadInput(input.contentType, input.size);
      if (
        !assertRepoMediaKeyMatchesContext(input.key.trim(), {
          organizationId: c.get("organizationId"),
          repoId: id,
          surface: input.surface,
        })
      ) {
        return c.json(
          { message: "Upload key does not match repo context" },
          400,
        );
      }
      const [asset] = await db
        .insert(assetTable)
        .values({
          organizationId: c.get("organizationId"),
          repoId: id,
          boardId: null,
          objectKey: input.key.trim(),
          filename: input.filename,
          mimeType: input.contentType,
          size: input.size,
          kind: isImageContentType(input.contentType) ? "image" : "attachment",
          surface: input.surface,
          createdBy: c.get("userId"),
        })
        .returning({ id: assetTable.id });
      if (!asset) {
        return c.json({ message: "Failed to create asset record" }, 500);
      }
      return c.json({
        id: asset.id,
        repoId: id,
        url: `/api/asset/${asset.id}`,
      });
    },
  )
  .post(
    "/:id/synced-issues",
    describeRoute({
      operationId: "createSyncedIssueForTask",
      tags: ["Repos"],
      description:
        "Create a GitHub issue from an existing Kaneo task and make the task follow it",
      responses: {
        200: { description: "Synced issue created" },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator("json", v.object({ taskId: v.string() })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const { taskId } = c.req.valid("json");
      return c.json(
        await createSyncedIssueForTask({
          repoId: id,
          taskId,
          organizationId: c.get("organizationId"),
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/issues/:number/synced-tasks",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator(
      "json",
      v.object({ boardId: v.string(), columnId: v.optional(v.string()) }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await addSyncedTask({
          repoId: id,
          number,
          ...c.req.valid("json"),
          organizationId: c.get("organizationId"),
        }),
      );
    },
  )
  .post(
    "/:id/issues/:number/synced-tasks/:taskId/retry",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
        taskId: v.string(),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number, taskId } = c.req.valid("param");
      return c.json(
        await syncTaskFromIssue({
          repoId: id,
          number,
          taskId,
          organizationId: c.get("organizationId"),
        }),
      );
    },
  )
  .delete(
    "/:id/issues/:number/synced-tasks/:taskId",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
        taskId: v.string(),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number, taskId } = c.req.valid("param");
      return c.json(
        await unsyncTaskFromIssue({
          repoId: id,
          number,
          taskId,
          organizationId: c.get("organizationId"),
        }),
      );
    },
  )
  .post(
    "/:id/sync",
    describeRoute({
      operationId: "syncRepo",
      tags: ["Repos"],
      description:
        "Pull the repository's issues and pull requests from its provider. Upserts on (repo, number); never creates tasks. Pass background=true to start the mirror and return immediately — a first sync of a large repository takes longer than an edge proxy will hold the request open.",
      responses: {
        200: {
          description: "Sync completed",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ issues: v.number(), pullRequests: v.number() }),
              ),
            },
          },
        },
        202: {
          description: "Sync started in the background",
          content: {
            "application/json": {
              schema: resolver(v.object({ started: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    validator(
      "query",
      v.optional(v.object({ background: v.optional(v.string()) })),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id } = c.req.valid("param");
      const background = c.req.valid("query")?.background === "true";

      // Connecting a repository must not hang on the first mirror. A real
      // repository's full issue+PR pagination runs well past the 60s an edge
      // proxy will hold a request open, which surfaced as a 504 on connect even
      // though the repo row had already been created. Kick the mirror off and
      // let the repo populate; failures are logged, never surfaced as a failed
      // connect for work that is still in flight.
      if (background) {
        void syncRepo(id).catch((error) => {
          console.error(`Background sync failed for repo ${id}:`, error);
        });
        return c.json({ started: true }, 202);
      }

      const result = await syncRepo(id);
      return c.json(result);
    },
  )
  .get(
    "/:id/releases",
    describeRoute({
      operationId: "listGitHubRepoReleases",
      tags: ["Repos"],
      description: "List a GitHub repository's releases and their assets",
      responses: {
        200: {
          description: "Repository releases",
          content: {
            "application/json": {
              schema: resolver(v.array(githubReleaseSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) => c.json(await listGitHubRepoReleases(c.req.valid("param").id)),
  )
  .get(
    "/:id/packages",
    describeRoute({
      operationId: "listGitHubRepoPackages",
      tags: ["Repos"],
      description: "List packages published from a GitHub repository",
      responses: {
        200: {
          description: "Repository packages",
          content: {
            "application/json": {
              schema: resolver(v.array(githubPackageSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) => c.json(await listGitHubRepoPackages(c.req.valid("param").id)),
  )
  .get(
    "/:id/github-metadata",
    describeRoute({
      operationId: "getGitHubRepoMetadata",
      tags: ["Repos"],
      description:
        "Live GitHub labels, assignable users and milestones for a repo, for building pickers. Non-GitHub repos return empty arrays.",
      responses: {
        200: {
          description: "GitHub repo metadata",
          content: {
            "application/json": {
              schema: resolver(githubRepoMetadataSchema),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) => c.json(await getGitHubRepoMetadata(c.req.valid("param").id)),
  )
  .get(
    "/:id/milestones",
    validator("param", v.object({ id: v.string() })),
    repoOrganizationAccess(),
    async (c) => c.json(await listGitHubMilestones(c.req.valid("param").id)),
  )
  .post(
    "/:id/milestones",
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        title: v.pipe(v.string(), v.minLength(1)),
        description: v.optional(v.string()),
        dueOn: v.optional(v.string()),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) =>
      c.json(
        await createGitHubMilestone(
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .patch(
    "/:id/milestones/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator(
      "json",
      v.object({
        title: v.optional(v.string()),
        description: v.optional(v.nullable(v.string())),
        dueOn: v.optional(v.nullable(v.string())),
        state: v.optional(v.picklist(["open", "closed"] as const)),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await updateGitHubMilestone(id, number, c.req.valid("json")),
      );
    },
  )
  .post(
    "/:id/issues/:number/close",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator(
      "json",
      v.object({ reason: v.picklist(["completed", "not_planned"] as const) }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await closeGitHubIssue({
          repoId: id,
          number,
          reason: c.req.valid("json").reason,
        }),
      );
    },
  )
  .post(
    "/:id/issues/:number/reopen",
    describeRoute({
      operationId: "reopenRepoIssue",
      tags: ["Repos"],
      description:
        "Reopen a closed GitHub issue as the authorized Kaneo member",
    }),
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await reopenGitHubIssue({
          repoId: id,
          number,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/issues/:number/sub-issues",
    describeRoute({
      operationId: "addRepoSubIssue",
      tags: ["Repos"],
      description: "Attach an existing issue as a sub-issue on GitHub",
    }),
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator(
      "json",
      v.object({
        subIssueNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await addGitHubSubIssue({
          repoId: id,
          number,
          subIssueNumber: c.req.valid("json").subIssueNumber,
        }),
      );
    },
  )
  .delete(
    "/:id/issues/:number/sub-issues/:subIssueNumber",
    describeRoute({
      operationId: "removeRepoSubIssue",
      tags: ["Repos"],
      description: "Detach a sub-issue on GitHub",
    }),
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
        subIssueNumber: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number, subIssueNumber } = c.req.valid("param");
      return c.json(
        await removeGitHubSubIssue({ repoId: id, number, subIssueNumber }),
      );
    },
  )
  .post(
    "/:id/issues/:number/duplicate",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator(
      "json",
      v.object({
        canonicalNumber: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await markGitHubIssueDuplicate({
          repoId: id,
          number,
          canonicalNumber: c.req.valid("json").canonicalNumber,
        }),
      );
    },
  )
  .delete(
    "/:id/issues/:number/duplicate",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(await unmarkGitHubIssueDuplicate({ repoId: id, number }));
    },
  )
  .patch(
    "/:id/issues/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", repoItemUpdateSchema),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await updateGitHubItem({
          repoId: id,
          number,
          kind: "issue",
          updates: c.req.valid("json"),
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/issues/:number/comments",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", v.object({ body: v.pipe(v.string(), v.minLength(1)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await createGitHubItemComment({
          repoId: id,
          number,
          body: c.req.valid("json").body,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .patch(
    "/:id/pull-requests/:number",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", repoItemUpdateSchema),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await updateGitHubItem({
          repoId: id,
          number,
          kind: "pullRequest",
          updates: c.req.valid("json"),
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/pull-requests/:number/comments",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator("json", v.object({ body: v.pipe(v.string(), v.minLength(1)) })),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await createGitHubItemComment({
          repoId: id,
          number,
          body: c.req.valid("json").body,
          userId: c.get("userId"),
        }),
      );
    },
  )
  .post(
    "/:id/pull-requests/:number/merge",
    validator(
      "param",
      v.object({
        id: v.string(),
        number: v.pipe(
          v.string(),
          v.transform(Number),
          v.integer(),
          v.minValue(1),
        ),
      }),
    ),
    validator(
      "json",
      v.optional(
        v.object({
          method: v.optional(
            v.picklist(["merge", "squash", "rebase"] as const),
          ),
        }),
      ),
    ),
    repoOrganizationAccess(),
    requireOrganizationPermission({ board: ["update"] }),
    async (c) => {
      const { id, number } = c.req.valid("param");
      return c.json(
        await mergeGitHubPullRequest({
          repoId: id,
          number,
          method: c.req.valid("json")?.method,
        }),
      );
    },
  );

export default repo;
