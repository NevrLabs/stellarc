import type { Page } from "@playwright/test";

// Contracts derived from auth-client.ts, get-config.ts and get-instance-status.ts.
export async function stubSignIn(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const responses: Record<string, unknown> = {
      "/api/auth/get-session": null,
      "/api/instance/status": { hasUsers: true, hasAdmin: true },
      "/api/config": {
        hasGoogleSignIn: false,
        hasGithubSignIn: false,
        hasDiscordSignIn: false,
        hasCustomOAuth: false,
        customOAuthAutoLogin: false,
        hasGuestAccess: false,
        disableLoginForm: false,
        hasSmtp: false,
        disableEmailOtpSignIn: true,
        disableRegistration: true,
        disablePasswordRegistration: true,
      },
    };
    if (request.method() === "GET" && Object.hasOwn(responses, path)) {
      await route.fulfill({ json: responses[path] });
      return;
    }
    unexpected.push(`${request.method()} ${path}`);
    await route.abort();
  });
  return unexpected;
}

// Shapes mirror src/types/repo/index.ts exactly (RepoIssue, RepoPullRequest,
// RepoIssuesResponse/RepoPullRequestsResponse pagination envelope).
const createdAt = "2026-01-01T00:00:00.000Z";
const organization = {
  id: "fixture-org",
  name: "Foundation Lab",
  slug: "foundation",
  createdAt,
  logo: null,
  reposEnabled: true,
};
const users = ["Ada", "Lin"].map((name, index) => ({
  id: `fixture-user-${index}`,
  name,
  email: `${name.toLowerCase()}@example.test`,
  emailVerified: true,
  createdAt,
  updatedAt: createdAt,
  image: null,
  locale: "en-US",
}));
const members = users.map((user, index) => ({
  id: `fixture-member-${index}`,
  organizationId: organization.id,
  userId: user.id,
  role: index === 0 ? "owner" : "member",
  createdAt,
  user,
}));
const tickets = ["First probe", "Second probe", "Third probe"].map(
  (name, index) => ({
    id: `fixture-ticket-${index}`,
    name,
    title: name,
    number: index + 1,
    boardId: "fixture-board",
    status: "to-do",
    priority: "medium",
    userId: users[0].id,
    createdAt,
    updatedAt: createdAt,
    labels: [],
  }),
);
const board = {
  id: "fixture-board",
  organizationId: organization.id,
  slug: "foundation-board",
  name: "Foundation Board",
  icon: "kanban",
  description: "Synthetic foundation work",
  createdAt,
  updatedAt: createdAt,
  archivedAt: null,
  startDate: null,
  dueDate: null,
  status: "active",
  plannedTasks: [],
  archivedTasks: [],
  tasks: tickets,
  statistics: {
    totalTasks: tickets.length,
    completionPercentage: 0,
    dueDate: null,
  },
  columns: ["to-do", "in-progress", "review", "done"].map((id, index) => ({
    id,
    name: ["To Do", "In Progress", "Review", "Done"][index],
    boardId: "fixture-board",
    position: index,
    isFinal: index === 3,
    tasks: index === 0 ? tickets : [],
  })),
};
const repo = {
  id: "fixture-repo",
  organizationId: organization.id,
  provider: "github",
  owner: "foundation",
  name: "probe",
  url: "https://example.test/foundation/probe",
  description: "Synthetic repository",
  defaultBranch: "main",
  isPrivate: false,
  config: null,
  isActive: true,
  lastSyncedAt: createdAt,
  openIssueCount: 1,
  openPullRequestCount: 1,
};
const repoPagination = {
  total: 1,
  page: 1,
  pageSize: 50,
  totalPages: 1,
};
const project = {
  id: "fixture-project",
  slug: "foundation-lab",
  name: "Sync Foundation",
  summary: "Ship the transactional event log and sync engine.",
  description: "T0 foundation slice: Effect HttpApi, event log, shape server.",
  successCriteria: "Stock adapter round-trips with awaitTxId.",
  status: "started" as const,
  priority: "high",
  leadUserName: "Ada",
  leadTeamName: null,
  startDate: createdAt,
  targetDate: "2026-12-31",
  archivedAt: null,
  progress: { completed: 1, eligible: 3, percent: 33 },
  health: null,
  organizationId: organization.id,
};
const projectUpdate = {
  id: "fixture-project-update-1",
  projectId: project.id,
  health: "on_track",
  content: "Snapshot/tail boundary proven deterministic.",
  authorName: "Ada",
  createdAt,
};

const fixtureIssue = {
  id: "fixture-issue-1",
  repoId: "fixture-repo",
  number: 7,
  title: "Gateway timeouts on /v1/shape",
  body: "Long-poll requests drop after the idle window.",
  state: "open" as const,
  authorLogin: "ada-fixture",
  authorAvatarUrl: null,
  assigneeLogins: ["lin-fixture"],
  labels: [{ name: "sync", color: "#2563eb" }],
  commentCount: 2,
  url: "https://example.test/foundation/probe/issues/7",
  externalCreatedAt: createdAt,
  closedAt: null,
  taskLinks: [
    {
      id: "fixture-link-1",
      taskId: "fixture-ticket-0",
      createdAt,
      syncEnabled: true,
      syncBrokenAt: null,
      syncBrokenReason: null,
      task: {
        id: "fixture-ticket-0",
        title: "First probe",
        status: "to-do",
        priority: "medium",
        number: 1,
        boardId: "fixture-board",
      },
    },
  ],
};
const fixtureIssueClosed = {
  ...fixtureIssue,
  id: "fixture-issue-2",
  number: 5,
  title: "Cursor overflow above 2^53",
  state: "closed" as const,
  assigneeLogins: null,
  closedAt: createdAt,
  taskLinks: [],
};
const fixturePullRequest = {
  id: "fixture-pr-1",
  repoId: "fixture-repo",
  number: 9,
  title: "Preserve bigint cursors across reconnects",
  body: "Encodes cursors as decimal strings end to end.",
  state: "open" as const,
  isDraft: false,
  authorLogin: "lin-fixture",
  authorAvatarUrl: null,
  headBranch: "fix/bigint-cursors",
  baseBranch: "main",
  labels: [{ name: "sync", color: "#2563eb" }],
  commentCount: 1,
  additions: 42,
  deletions: 7,
  changedFiles: 2,
  url: "https://example.test/foundation/probe/pulls/9",
  externalCreatedAt: createdAt,
  mergedAt: null,
  closedAt: null,
  taskLinks: [],
};
// Exact response shapes come from the lifted fetchers and BetterAuth client.
export async function stubOrgShell(page: Page) {
  const unexpected = await stubSignIn(page);
  await page.clock.setFixedTime(new Date("2026-01-02T12:00:00.000Z"));
  const responses: Record<string, unknown> = {
    "/api/auth/get-session": {
      user: users[0],
      session: {
        id: "fixture-session",
        userId: users[0].id,
        activeOrganizationId: organization.id,
        expiresAt: "2099-01-01T00:00:00.000Z",
        createdAt,
        updatedAt: createdAt,
      },
    },
    "/api/auth/organization/list": [organization],
    "/api/auth/organization/get-full-organization": {
      ...organization,
      members,
      teams: [],
      invitations: [],
    },
    "/api/auth/organization/list-members": { members, total: members.length },
    "/api/auth/organization/list-teams": [],
    "/api/board": [board],
    "/api/board/fixture-board": board,
    "/api/task/tasks/fixture-board": { data: board },
    "/api/organization/fixture-org/principals": users.map((user) => ({
      ...user,
      kind: "user",
    })),
    "/api/label/organization/fixture-org": [],
    "/api/task/my-tasks": tickets,
    "/api/flag/mine": [],
    "/api/notification/unread-count": { count: 0 },
    "/api/invitation/pending": [],
    "/api/data-table/organization/fixture-org": [],
    "/api/ai/organization/fixture-org/settings": {
      enabled: false,
      configured: false,
      effectiveTokenLimit: 0,
      effectiveCharacterLimit: 0,
    },
    "/api/repo?organizationId=fixture-org": [repo],
    "/api/repo/fixture-repo": repo,
    "/api/repo/fixture-repo/github-metadata": {
      labels: [{ name: "sync", color: "#2563eb", description: null }],
      assignableUsers: [
        { login: "ada-fixture", avatarUrl: "" },
        { login: "lin-fixture", avatarUrl: "" },
      ],
      milestones: [],
    },
    "/api/repo/fixture-repo/issues?state=open&page=1&limit=50": {
      data: [fixtureIssue],
      pagination: repoPagination,
    },
    "/api/repo/fixture-repo/issues?state=all&page=1&limit=100": {
      data: [fixtureIssue, fixtureIssueClosed],
      pagination: { ...repoPagination, total: 2 },
    },
    "/api/repo/fixture-repo/issues/7": fixtureIssue,
    "/api/repo/fixture-repo/pull-requests?state=open&page=1&limit=50": {
      data: [fixturePullRequest],
      pagination: repoPagination,
    },
    "/api/repo/fixture-repo/pull-requests/9": fixturePullRequest,
    "/api/repo/fixture-repo/pull-requests/9/checks": {
      conclusion: "success",
      headSha: "c1ffee0",
      checks: [
        {
          name: "ci/foundation",
          status: "completed",
          conclusion: "success",
          startedAt: createdAt,
          completedAt: createdAt,
          url: "https://example.test/checks/1",
        },
      ],
      runs: [],
      unavailable: [],
    },
    "/api/repo/fixture-repo/pull-requests/9/commits": {
      commits: [
        {
          sha: "c1ffee0",
          message: "Preserve bigint cursors across reconnects",
          authorLogin: "lin-fixture",
          authorAvatarUrl: null,
          committedAt: createdAt,
          url: "https://example.test/commit/c1ffee0",
        },
      ],
    },
    "/api/repo/fixture-repo/pull-requests/9/files": {
      files: [
        {
          filename: "packages/sync/src/index.ts",
          status: "modified",
          additions: 42,
          deletions: 7,
          changes: 49,
          patch: "@@ -1,3 +1,4 @@",
        },
      ],
      totals: { additions: 42, deletions: 7, changedFiles: 2 },
    },
    "/api/repo/fixture-repo/pull-requests/9/reviews": {
      reviews: [
        {
          id: 1,
          state: "APPROVED",
          body: "Boundary math checks out.",
          submittedAt: createdAt,
          authorLogin: "ada-fixture",
          authorAvatarUrl: null,
          url: null,
        },
      ],
      comments: [],
    },
    "/api/project?organizationId=fixture-org": [project],
    "/api/project/resolve?organizationId=fixture-org&slug=foundation-lab":
      project,
    "/api/project/fixture-project": project,
    "/api/project/fixture-project/tickets": [],
    "/api/project/fixture-project/milestones": [],
    "/api/project/fixture-project/updates": [projectUpdate],
    "/api/project/fixture-project/resources": [],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const search = new URL(request.url()).search;
    const key = `${path}${search}`;
    if (
      request.method() === "GET" &&
      (Object.hasOwn(responses, key) || Object.hasOwn(responses, path))
    ) {
      await route.fulfill({
        json: Object.hasOwn(responses, key) ? responses[key] : responses[path],
      });
    } else if (
      request.method() === "POST" &&
      path === "/api/auth/organization/has-permission"
    ) {
      await route.fulfill({ json: { success: true, error: null } });
    } else {
      await route.fallback();
    }
  });
  await page.routeWebSocket("**/user?*", (socket) => {
    socket.onMessage((message) => {
      if (message === '{"type":"ping"}') socket.send('{"type":"pong"}');
    });
  });
  return unexpected;
}
