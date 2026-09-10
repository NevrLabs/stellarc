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
    "/api/repo": [
      {
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
      },
    ],
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && Object.hasOwn(responses, path)) {
      await route.fulfill({ json: responses[path] });
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
