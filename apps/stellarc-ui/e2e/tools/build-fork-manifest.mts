// Builds e2e/fork-manifest.json — the committed mirror/provenance manifest for
// STL-14's frozen UI lift (spec §5: "Create a committed mirror manifest
// identifying source SHA, source→destination paths and actual fixture endpoint
// contracts before implementation review").
//
// Usage: bun apps/stellarc-ui/e2e/tools/build-fork-manifest.mts
//   --kaneo /path/to/kaneo   (default /home/rpw/repos/kaneo)
//   --out path               (default apps/stellarc-ui/e2e/fork-manifest.json)
//
// The source SHA is read from git (pinned commit 2504e645…), never trusted from
// a dirty checkout. Every mirrored file must exist in BOTH the pinned commit and
// the destination tree, byte-exact — a drift exits nonzero.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const argValue = (name: string, fallback?: string) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const kaneoRoot = resolve(argValue("--kaneo", "/home/rpw/repos/kaneo"));
const outPath = resolve(
  argValue("--out", join(import.meta.dir, "..", "fork-manifest.json")),
);
const worktreeRoot = resolve(join(import.meta.dir, "..", "..", "..", ".."));

// --- 1. Pinned source -------------------------------------------------------
const SHA = "2504e64512b84b9b739d4d4fb0d4ceaefdb14783";
const git = (args: string[]) =>
  spawnSync("git", ["-C", kaneoRoot, ...args], { encoding: "utf8" });
// Binary-safe capture: no encoding → stdout is a Buffer.
const gitBinary = (args: string[]) =>
  spawnSync("git", ["-C", kaneoRoot, ...args]);
const head = git(["rev-parse", "HEAD"]).stdout?.trim();
if (head !== SHA) {
  console.error(`kaneo checkout HEAD ${head} is not the pinned ${SHA}`);
  process.exit(1);
}

// --- 2. Mirror table --------------------------------------------------------
// [destination (repo-root relative), kaneo source (repo-root relative), kind]
// kind "exact" = byte-exact production-source mirror (spec §5 UI lift rule).
const mirrors: Array<[string, string, "exact" | "adapted" | "generated"]> = [
  ["apps/stellarc-ui/components.json", "apps/web/components.json", "exact"],
  ["apps/stellarc-ui/index.html", "apps/web/index.html", "exact"],
  ["apps/stellarc-ui/package.json", "apps/web/package.json", "adapted"],
  ["apps/stellarc-ui/postcss.config.js", "apps/web/postcss.config.js", "exact"],
  ...[
    "apple-touch-icon.png",
    "embed.html",
    "embed.js",
    "favicon-96x96.png",
    "favicon.ico",
    "favicon.svg",
    "logo-dark.svg",
    "logo-light.svg",
    "site.webmanifest",
    "web-app-manifest-192x192.png",
    "web-app-manifest-512x512.png",
  ].map((f) => [
    `apps/stellarc-ui/public/${f}`,
    `apps/web/public/${f}`,
    "exact",
  ]),
  [
    "apps/stellarc-ui/src/assets/fonts/CalSans-SemiBold.woff2",
    "apps/web/src/assets/fonts/CalSans-SemiBold.woff2",
    "exact",
  ],
  [
    "apps/stellarc-ui/src/assets/fonts/CalSansUI[wght,GEOM]-s.p.c2e3469d.woff2",
    "apps/web/src/assets/fonts/CalSansUI[wght,GEOM]-s.p.c2e3469d.woff2",
    "exact",
  ],
  [
    "apps/stellarc-ui/src/assets/fonts/PaperMono-Regular.woff2",
    "apps/web/src/assets/fonts/PaperMono-Regular.woff2",
    "exact",
  ],
  ...[
    "account/notification-preferences-settings.tsx",
    "activity/comment-card.tsx",
    "activity/comment-editor.tsx",
    "activity/comment-input.tsx",
    "activity/compact-activities.ts",
    "activity/index.tsx",
    "activity/unflag-control.tsx",
    "activity/utils.ts",
    "ai/ai-chat-bubble.tsx",
    "app-sidebar.tsx",
    "auth/layout.tsx",
    "auth/otp-sign-in-form.tsx",
    "auth/sign-in-form-skeleton.tsx",
    "auth/sign-in-form.tsx",
    "auth/sign-up-form.tsx",
    "auth/sso-providers.tsx",
    "auth/toggle.tsx",
    "auth/turnstile.tsx",
    "backlog-list-view/backlog-task-row.tsx",
    "backlog-list-view/index.tsx",
    "board/board-default-assignee.tsx",
    "board/board-milestones-section.tsx",
    "board/board-properties-panel.tsx",
    "board/board-sync-indicator.tsx",
    "board/board-toolbar.tsx",
    "board/board-view-options.tsx",
    "board/board-view-tabs.tsx",
    "board/boards-timeline-sections.ts",
    "board/boards-timeline.tsx",
    "board/column-editor.tsx",
    "board/discord-integration-settings.tsx",
    "board/generic-webhook-integration-settings.tsx",
    "board/gitea-integration-settings.tsx",
    "board/gitea-repository-browser-modal.tsx",
    "board/github-integration-settings.tsx",
    "board/milestones-view.tsx",
    "board/repository-browser-modal.tsx",
    "board/slack-integration-settings.tsx",
    "board/tasks-import-export.tsx",
    "board/telegram-integration-settings.tsx",
    "board/workflow-editor.tsx",
    "bulk-selection/backlog-bulk-toolbar.tsx",
    "bulk-selection/bulk-toolbar.tsx",
    "command-palette/index.tsx",
    "common/board-icon-picker.tsx",
    "common/board-layout.tsx",
    "common/board-skeleton.tsx",
    "common/entity-icon.tsx",
    "common/header/board-crumb-select.tsx",
    "common/header/mobile-board-nav.tsx",
    "common/header/organization-crumb-select.tsx",
    "common/header/task-crumb-select.tsx",
    "common/layout.tsx",
    "common/logo.tsx",
    "common/mobile-user-fab.tsx",
    "common/organization-layout.tsx",
    "common/pending-sync-indicator.tsx",
    "common/repo-layout.tsx",
    "common/sidebar-resize-handle.tsx",
    "common/sort-control.tsx",
    "common/task-layout.tsx",
    "common/task-view-controls.tsx",
    "common/view-tabs.tsx",
    "connections/account-github-connection.tsx",
    "connections/github-permissions.ts",
    "connections/organization-github-connection.tsx",
    "data-table/data-table-grid.tsx",
    "demo-alert.tsx",
    "error-boundary.tsx",
    "flag/flag-badge.tsx",
    "flag/flag-icon.ts",
    "flag/task-flag-badges.tsx",
    "flag/task-flag-picker.tsx",
    "flag/task-flag-section.tsx",
    "gantt/gantt-dependency-arrows.tsx",
    "gantt/gantt-milestone-row.tsx",
    "gantt/gantt-milestones.ts",
    "gantt/gantt-scheduling.ts",
    "gantt/gantt-sections.ts",
    "gantt/gantt-task-bar.tsx",
    "gantt/gantt-task-rail-dnd.ts",
    "gantt/gantt-timeline.ts",
    "gantt/gantt-unscheduled-track.tsx",
    "inbox-unread-badge.tsx",
    "kanban-board/board-view-context.tsx",
    "kanban-board/column/column-dropzone.tsx",
    "kanban-board/column/column-header.tsx",
    "kanban-board/column/index.tsx",
    "kanban-board/index.tsx",
    "kanban-board/task-card-context-menu/task-card-context-menu-content.tsx",
    "kanban-board/task-card.tsx",
    "kanban-board/task-hover-preview.tsx",
    "kanban-board/task-labels.tsx",
    "keyboard-shortcuts-help.tsx",
    "list-view/index.tsx",
    "list-view/list-bulk-actions-toggle.tsx",
    "list-view/list-grouping.ts",
    "list-view/list-nest-hint.tsx",
    "list-view/task-row.tsx",
    "my-tasks-count-badge.tsx",
    "nav-boards.tsx",
    "nav-hidden-items.tsx",
    "nav-main.tsx",
    "nav-projects.tsx",
    "nav-repos.tsx",
    "nav-tables.tsx",
    "notification/notification-dropdown.tsx",
    "onboarding/onboarding-flow.tsx",
    "organization-switcher.tsx",
    "page-title.tsx",
    "permission-denied.tsx",
    "presence/board-access-avatars.tsx",
    "principal-picker-list.tsx",
    "principal-selector.tsx",
    "profile-setup/profile-setup-flow.tsx",
    "project/archive-project-dialog.tsx",
    "project/create-project-modal.tsx",
    "project/project-contextual-resources.tsx",
    "project/project-header.tsx",
    "project/project-health-badge.tsx",
    "project/project-list.tsx",
    "project/project-milestones-section.tsx",
    "project/project-overview.tsx",
    "project/project-properties-form.tsx",
    "project/project-resource-link-dialog.tsx",
    "project/project-resource-row.tsx",
    "project/project-resource-unlink-dialog.tsx",
    "project/project-row.tsx",
    "project/project-staleness-indicator.tsx",
    "project/project-tabs.tsx",
    "project/project-ticket-picker.tsx",
    "project/project-ticket-row.tsx",
    "project/project-ticket-view-model.ts",
    "project/project-tickets.tsx",
    "project/project-update-composer.tsx",
    "project/project-update-delete-dialog.tsx",
    "project/project-update-edit-dialog.tsx",
    "project/project-update-list.tsx",
    "project/project-update-row.tsx",
    "project/project-updates-panel.tsx",
    "project/projects-overview.tsx",
    "providers/auth-provider/hooks/use-auth.ts",
    "providers/auth-provider/index.tsx",
    "providers/theme-provider/index.tsx",
    "public-board/copy-url-button.tsx",
    "public-board/error-view.tsx",
    "public-board/kanban-view.tsx",
    "public-board/kaneo-branding.tsx",
    "public-board/list-view.tsx",
    "public-board/loading-skeleton.tsx",
    "public-board/markdown-renderer.tsx",
    "public-board/public-pr-badge.tsx",
    "public-board/public-task-labels.tsx",
    "public-board/task-card.tsx",
    "public-board/task-detail-modal.tsx",
    "public-board/task-row.tsx",
    "public-board/theme-toggle.tsx",
    "repo/add-repo-dialog.tsx",
    "repo/link-ticket-candidate-row.tsx",
    "repo/pull-request-file-tree.tsx",
    "repo/pull-request-live-details.tsx",
    "repo/pull-request-reviews.tsx",
    "repo/repo-avatar.tsx",
    "repo/repo-description-editor.tsx",
    "repo/repo-detail-management.tsx",
    "repo/repo-diff-delta.tsx",
    "repo/repo-issue-history.tsx",
    "repo/repo-issue-relations.tsx",
    "repo/repo-item-actions.tsx",
    "repo/repo-item-detail-layout.tsx",
    "repo/repo-label-list.tsx",
    "repo/repo-list-row.tsx",
    "repo/repo-master-detail.tsx",
    "repo/repo-state-badge.tsx",
    "repo/repo-task-links.tsx",
    "resource-grant-editor.tsx",
    "search-command-menu/index.tsx",
    "search.tsx",
    "settings-layout.tsx",
    "settings/agent-manager.tsx",
    "settings/ai-settings.tsx",
    "settings/api-key-created-modal.tsx",
    "settings/api-key-table.tsx",
    "settings/avatar-crop-dialog.tsx",
    "settings/create-api-key-dialog.tsx",
    "settings/settings-org-header.tsx",
    "settings/settings-section-nav.tsx",
    "shared/modals/archive-tasks-modal.tsx",
    "shared/modals/create-board-modal.tsx",
    "shared/modals/create-data-table-modal.tsx",
    "shared/modals/create-organization-modal.tsx",
    "shared/modals/create-task-modal.tsx",
    "shared/modals/title-token-suggestions.tsx",
    "sidebar-sort.tsx",
    "task/attachment-context-menu.tsx",
    "task/create-task-action.tsx",
    "task/create-task-topbar.tsx",
    "task/description-resources.ts",
    "task/extensions/attachment-card.tsx",
    "task/extensions/details-block.ts",
    "task/extensions/embed-block.ts",
    "task/extensions/kaneo-issue-link.tsx",
    "task/extensions/kaneo-mention.tsx",
    "task/extensions/mention-list.tsx",
    "task/extensions/mention-suggestion.tsx",
    "task/extensions/mermaid-block.ts",
    "task/extensions/reference-list.tsx",
    "task/extensions/reference-suggestion.tsx",
    "task/extensions/resizable-image.tsx",
    "task/extensions/shiki-code-block.ts",
    "task/extensions/task-item-with-checkbox.tsx",
    "task/extensions/url-safety.ts",
    "task/label-source.ts",
    "task/milestone-badge.tsx",
    "task/parent-task-options.ts",
    "task/relation-direction.ts",
    "task/resource-picker-row.tsx",
    "task/resource-sync-badge.tsx",
    "task/slash-trigger.ts",
    "task/subtask-assignee-popover.tsx",
    "task/subtask-of-badge.tsx",
    "task/subtask-priority-popover.tsx",
    "task/subtask-row.tsx",
    "task/subtask-status-popover.tsx",
    "task/task-assignee-avatar.tsx",
    "task/task-assignee-popover.tsx",
    "task/task-description-editor.tsx",
    "task/task-description-history.tsx",
    "task/task-description.tsx",
    "task/task-details-content.tsx",
    "task/task-details-sheet.tsx",
    "task/task-due-date-badge.tsx",
    "task/task-due-date-popover.tsx",
    "task/task-follow-toggle.tsx",
    "task/task-labels-popover.tsx",
    "task/task-labels-row.tsx",
    "task/task-markdown.ts",
    "task/task-milestone-picker.tsx",
    "task/task-move-popover.tsx",
    "task/task-page-skeleton.tsx",
    "task/task-priority-popover.tsx",
    "task/task-properties-sidebar.tsx",
    "task/task-relations.tsx",
    "task/task-repo-label-visibility.ts",
    "task/task-resource-indicators.tsx",
    "task/task-resource-links.ts",
    "task/task-resources.tsx",
    "task/task-start-date-popover.tsx",
    "task/task-status-popover.tsx",
    "task/task-subtasks.tsx",
    "task/task-synced-issue-property.tsx",
    "task/task-template-menu.tsx",
    "task/task-title.tsx",
    "task/task-topbar-controls.tsx",
    "task/task-topbar-milestone.tsx",
    "task/todo-progress-badge.tsx",
    "team-view-selector.tsx",
    "team/delete-team-member-modal.tsx",
    "team/invite-team-member-modal.tsx",
    "team/members-table.tsx",
    "team/organization-members-groups.tsx",
    "team/resolve-team-members-result.ts",
    "team/team-member-count.tsx",
    "theme-toggle-dropdown.tsx",
    "ticket/ticket-page.tsx",
    "ui/accordion.tsx",
    "ui/alert-dialog.tsx",
    "ui/alert.tsx",
    "ui/autocomplete.tsx",
    "ui/avatar.tsx",
    "ui/badge.tsx",
    "ui/breadcrumb.tsx",
    "ui/button.tsx",
    "ui/calendar.tsx",
    "ui/card.tsx",
    "ui/checkbox-group.tsx",
    "ui/checkbox.tsx",
    "ui/circular-progress.tsx",
    "ui/collapsible.tsx",
    "ui/combobox.tsx",
    "ui/command.tsx",
    "ui/context-menu.tsx",
    "ui/dialog.tsx",
    "ui/empty.tsx",
    "ui/error-boundary.tsx",
    "ui/error-display.tsx",
    "ui/error-fallback.tsx",
    "ui/error-test.tsx",
    "ui/field.tsx",
    "ui/fieldset.tsx",
    "ui/form.tsx",
    "ui/frame.tsx",
    "ui/group.tsx",
    "ui/input-group.tsx",
    "ui/input-otp.tsx",
    "ui/input.tsx",
    "ui/kbd.tsx",
    "ui/label.tsx",
    "ui/loading-skeleton.tsx",
    "ui/menu.tsx",
    "ui/menubar.tsx",
    "ui/meter.tsx",
    "ui/number-field.tsx",
    "ui/pagination.tsx",
    "ui/popover.tsx",
    "ui/preview-card.tsx",
    "ui/progress.tsx",
    "ui/radio-group.tsx",
    "ui/scroll-area.tsx",
    "ui/select.tsx",
    "ui/separator.tsx",
    "ui/sheet.tsx",
    "ui/shortcut-number.tsx",
    "ui/sidebar.tsx",
    "ui/skeleton.tsx",
    "ui/slider.tsx",
    "ui/spinner.tsx",
    "ui/switch.tsx",
    "ui/table.tsx",
    "ui/tabs.tsx",
    "ui/textarea.tsx",
    "ui/timeline.tsx",
    "ui/toast.tsx",
    "ui/toggle-group.tsx",
    "ui/toggle.tsx",
    "ui/toolbar.tsx",
    "ui/tooltip.tsx",
    "user-avatar.tsx",
    "version-display.tsx",
  ].map((f) => [
    `apps/stellarc-ui/src/components/${f}`,
    `apps/web/src/components/${f}`,
    "exact",
  ]),
  ...[
    "board-icons.ts",
    "column-icons.ts",
    "columns.ts",
    "label-colors.ts",
    "priority-colors.ts",
    "shortcuts.ts",
    "task-statuses.ts",
    "urls.ts",
  ].map((f) => [
    `apps/stellarc-ui/src/constants/${f}`,
    `apps/web/src/constants/${f}`,
    "exact",
  ]),
  [
    "packages/contracts/src/legacy/libs/api-url.ts",
    "packages/libs/src/api-url.ts",
    "exact",
  ],
  [
    "packages/contracts/src/legacy/libs/hono.ts",
    "packages/libs/src/hono.ts",
    "exact",
  ],
  [
    "packages/contracts/src/legacy/libs/index.ts",
    "packages/libs/src/index.ts",
    "exact",
  ],
  [
    "packages/contracts/src/legacy/permissions/index.ts",
    "packages/permissions/src/index.ts",
    "exact",
  ],
  ["apps/stellarc-ui/src/index.css", "apps/web/src/index.css", "exact"],
  ["apps/stellarc-ui/src/main.tsx", "apps/web/src/main.tsx", "exact"],
  [
    "apps/stellarc-ui/src/routeTree.gen.ts",
    "apps/web/src/routeTree.gen.ts",
    "exact",
  ],
  ["apps/stellarc-ui/src/vite-env.d.ts", "apps/web/src/vite-env.d.ts", "exact"],
  [
    "apps/stellarc-ui/src/query-client/index.ts",
    "apps/web/src/query-client/index.ts",
    "exact",
  ],
  ["apps/stellarc-ui/src/test/setup.ts", "apps/web/src/test/setup.ts", "exact"],
  [
    "apps/stellarc-ui/src/tanstack/router.tsx",
    "apps/web/src/tanstack/router.tsx",
    "exact",
  ],
  [
    "apps/stellarc-ui/tsconfig.app.json",
    "apps/web/tsconfig.app.json",
    "adapted",
  ],
  ["apps/stellarc-ui/tsconfig.json", "apps/web/tsconfig.json", "adapted"],
  [
    "apps/stellarc-ui/tsconfig.node.json",
    "apps/web/tsconfig.node.json",
    "adapted",
  ],
  ["apps/stellarc-ui/vite.config.ts", "apps/web/vite.config.ts", "adapted"],
  ["apps/stellarc-ui/vitest.config.ts", "apps/web/vitest.config.ts", "adapted"],
  ["biome.json", "biome.json", "adapted"],
  ["turbo.json", "turbo.json", "adapted"],
  ["package.json", "package.json", "adapted"],
];

// Everything under these prefixes is enumerated from git at the pinned SHA so
// the manifest cannot silently miss lifted files (hooks, fetchers, routes,
// stores, types, lib, i18n resources).
const enumeratedPrefixes: Array<[string, string, "exact"]> = [
  ["apps/stellarc-ui/src/fetchers/", "apps/web/src/fetchers/", "exact"],
  ["apps/stellarc-ui/src/hooks/", "apps/web/src/hooks/", "exact"],
  ["apps/stellarc-ui/src/routes/", "apps/web/src/routes/", "exact"],
  ["apps/stellarc-ui/src/store/", "apps/web/src/store/", "exact"],
  ["apps/stellarc-ui/src/types/", "apps/web/src/types/", "exact"],
  ["apps/stellarc-ui/src/lib/", "apps/web/src/lib/", "exact"],
  ["i18n/", "i18n/", "exact"],
];

const lsTree = (prefix: string) =>
  (git(["ls-tree", "-r", "--name-only", SHA, prefix]).stdout ?? "")
    .split("\n")
    .filter(Boolean);

for (const [destPrefix, srcPrefix, kind] of enumeratedPrefixes) {
  for (const src of lsTree(srcPrefix)) {
    if (src.endsWith("/")) continue;
    // The fork's own co-located unit tests are intentionally not lifted: T0's
    // test surface is the Stellarc Bun/Vitest suites plus Playwright E2E.
    // Fork tests exercise fork internals against the old backend and are not
    // presented as Stellarc tests (spec §5 UI lift rule).
    if (/(^|\/)__tests__\//.test(src) || /\.test\.[tj]sx?$/.test(src)) continue;
    mirrors.push([destPrefix + src.slice(srcPrefix.length), src, kind]);
  }
}

// --- 3. Fixture endpoint contracts ------------------------------------------
// Recorded against the lifted fetchers' real call sites; the Playwright stubs
// in e2e/fixtures.ts must answer exactly these. Paths are after the `/api`
// base resolved by resolveApiBaseUrl; authClient endpoints carry the
// better-auth basePath `/api/auth`.
const fixtureEndpoints = {
  authSession: {
    method: "GET",
    path: "/api/auth/get-session",
    consumer: "src/lib/auth-client.ts (better-auth react client)",
    fixture: "auth-null | {user, session}",
  },
  instanceStatus: {
    method: "GET",
    path: "/api/instance/status",
    consumer: "src/fetchers/instance/get-instance-status.ts",
    fixture: "{hasUsers, hasAdmin}",
  },
  config: {
    method: "GET",
    path: "/api/config",
    consumer: "src/fetchers/config/get-config.ts",
    fixture:
      "{hasGoogleSignIn, hasGithubSignIn, hasDiscordSignIn, hasCustomOAuth, customOAuthAutoLogin, hasGuestAccess, disableLoginForm, hasSmtp, disableEmailOtpSignIn, disableRegistration, disablePasswordRegistration}",
  },
  organizationList: {
    method: "GET",
    path: "/api/auth/organization/list",
    consumer:
      "authClient.useListOrganizations (better-auth organizationClient)",
    fixture: "[organization]",
  },
  fullOrganization: {
    method: "GET",
    path: "/api/auth/organization/get-full-organization",
    consumer: "authClient.useActiveOrganization / useGetFullOrganization",
    fixture: "{…organization, members, teams, invitations}",
  },
  listMembers: {
    method: "GET",
    path: "/api/auth/organization/list-members",
    consumer: "authClient organization plugin",
    fixture: "{members, total}",
  },
  listTeams: {
    method: "GET",
    path: "/api/auth/organization/list-teams",
    consumer: "authClient organization plugin",
    fixture: "[]",
  },
  hasPermission: {
    method: "POST",
    path: "/api/auth/organization/has-permission",
    consumer: "authClient organization plugin (useOrganizationPermission)",
    fixture: "{success: true, error: null}",
  },
  boards: {
    method: "GET",
    path: "/api/board",
    consumer: "src/fetchers/board/get-boards.ts",
    fixture: "[board with columns[] and tasks[]]",
  },
  board: {
    method: "GET",
    path: "/api/board/:boardId",
    consumer: "src/fetchers/board/get-board.ts",
    fixture: "board",
  },
  boardTasks: {
    method: "GET",
    path: "/api/task/tasks/:boardId",
    consumer: "src/fetchers/task/get-tasks.ts",
    fixture: "{data: board}",
  },
  myTasks: {
    method: "GET",
    path: "/api/task/my-tasks",
    consumer: "src/fetchers/task/get-my-tasks.ts",
    fixture: "[ticket]",
  },
  principals: {
    method: "GET",
    path: "/api/organization/:orgId/principals",
    consumer: "src/fetchers/organization-member/get-organization-principals.ts",
    fixture: "[user + kind]",
  },
  labels: {
    method: "GET",
    path: "/api/label/organization/:orgId",
    consumer: "src/fetchers/label/get-label-by-organization.ts",
    fixture: "[]",
  },
  myFlags: {
    method: "GET",
    path: "/api/flag/mine",
    consumer: "src/fetchers/flag/get-my-flags.ts",
    fixture: "[]",
  },
  unreadNotifications: {
    method: "GET",
    path: "/api/notification/unread-count",
    consumer: "src/fetchers/notification/get-unread-notification-count.ts",
    fixture: "{count: 0}",
  },
  pendingInvitations: {
    method: "GET",
    path: "/api/invitation/pending",
    consumer: "src/fetchers/invitation/get-pending-invitations.ts",
    fixture: "[]",
  },
  dataTables: {
    method: "GET",
    path: "/api/data-table/organization/:orgId",
    consumer: "src/fetchers/data-table/data-table.ts",
    fixture: "[]",
  },
  aiSettings: {
    method: "GET",
    path: "/api/ai/organization/:orgId/settings",
    consumer: "src/fetchers/ai/get-ai-settings.ts",
    fixture:
      "{enabled, configured, effectiveTokenLimit, effectiveCharacterLimit}",
  },
  repos: {
    method: "GET",
    path: "/api/repo?organizationId=:orgId",
    consumer: "src/fetchers/repo/get-repos.ts",
    fixture: "[repo]",
  },
  repo: {
    method: "GET",
    path: "/api/repo/:repoId",
    consumer: "src/fetchers/repo/get-repo.ts",
    fixture: "repo",
  },
  repoGithubMetadata: {
    method: "GET",
    path: "/api/repo/:repoId/github-metadata",
    consumer: "src/fetchers/repo/get-repo-github-metadata.ts",
    fixture: "{labels, assignableUsers, milestones}",
  },
  repoIssues: {
    method: "GET",
    path: "/api/repo/:repoId/issues?state&page&limit",
    consumer: "src/fetchers/repo/get-repo-issues.ts",
    fixture: "{data: [issue], pagination{total,page,pageSize,totalPages}}",
  },
  repoIssue: {
    method: "GET",
    path: "/api/repo/:repoId/issues/:number",
    consumer: "src/fetchers/repo/get-repo-issue.ts",
    fixture: "issue with taskLinks[]",
  },
  repoPullRequests: {
    method: "GET",
    path: "/api/repo/:repoId/pull-requests?state&page&limit",
    consumer: "src/fetchers/repo/get-repo-pull-requests.ts",
    fixture: "{data: [pullRequest], pagination}",
  },
  repoPullRequest: {
    method: "GET",
    path: "/api/repo/:repoId/pull-requests/:number",
    consumer: "src/fetchers/repo/get-repo-pull-request.ts",
    fixture: "pullRequest",
  },
  prChecks: {
    method: "GET",
    path: "/api/repo/:repoId/pull-requests/:number/checks",
    consumer: "src/fetchers/repo/get-pull-request-checks.ts",
    fixture: "{conclusion, headSha, checks[], runs[], unavailable[]}",
  },
  prCommits: {
    method: "GET",
    path: "/api/repo/:repoId/pull-requests/:number/commits",
    consumer: "src/fetchers/repo/get-pull-request-commits.ts",
    fixture: "{commits[]}",
  },
  prFiles: {
    method: "GET",
    path: "/api/repo/:repoId/pull-requests/:number/files",
    consumer: "src/fetchers/repo/get-pull-request-files.ts",
    fixture: "{files[], totals}",
  },
  prReviews: {
    method: "GET",
    path: "/api/repo/:repoId/pull-requests/:number/reviews",
    consumer: "src/fetchers/repo/get-pull-request-reviews.ts",
    fixture: "{reviews[], comments[]}",
  },
  projects: {
    method: "GET",
    path: "/api/project?organizationId=:orgId",
    consumer: "src/fetchers/project/get-projects.ts",
    fixture: "[project]",
  },
  projectResolve: {
    method: "GET",
    path: "/api/project/resolve?organizationId&slug",
    consumer: "src/fetchers/project/resolve-project-slug.ts",
    fixture: "project",
  },
  project: {
    method: "GET",
    path: "/api/project/:projectId",
    consumer: "src/fetchers/project/get-project.ts",
    fixture: "project",
  },
  projectTickets: {
    method: "GET",
    path: "/api/project/:projectId/tickets",
    consumer: "src/fetchers/project/get-project-tickets.ts",
    fixture: "[]",
  },
  projectMilestones: {
    method: "GET",
    path: "/api/project/:projectId/milestones",
    consumer: "src/fetchers/project/get-project-milestones.ts",
    fixture: "[]",
  },
  projectUpdates: {
    method: "GET",
    path: "/api/project/:projectId/updates",
    consumer: "src/fetchers/project/list-project-updates.ts",
    fixture: "[projectUpdate]",
  },
  projectResources: {
    method: "GET",
    path: "/api/project/:projectId/resources",
    consumer: "src/fetchers/project/get-project-resources.ts",
    fixture: "[]",
  },
  userWebsocket: {
    method: "WS",
    path: "/user?*",
    consumer: "src/hooks/use-user-websocket.ts",
    fixture: 'echoes {"type":"ping"} → {"type":"pong"}',
  },
} as const;

// --- 4. Verify every mirror exists in both trees; hash exact mirrors --------
// §5d authorised lint cleanup touched 16 lifted files after the mirror (unused
// `biome-ignore` removal + mechanical format/import-order). Each was verified
// diff-only against the pinned source: no behavioural edit. They are recorded
// as "adapted" with the reason; byte equality is enforced only for "exact".
const lintAdapted = new Set([
  "apps/stellarc-ui/src/components/backlog-list-view/backlog-task-row.tsx",
  "apps/stellarc-ui/src/components/board/board-default-assignee.tsx",
  "apps/stellarc-ui/src/components/board/column-editor.tsx",
  "apps/stellarc-ui/src/components/board/tasks-import-export.tsx",
  "apps/stellarc-ui/src/components/kanban-board/column/column-dropzone.tsx",
  "apps/stellarc-ui/src/components/kanban-board/task-card.tsx",
  "apps/stellarc-ui/src/components/list-view/task-row.tsx",
  "apps/stellarc-ui/src/components/principal-picker-list.tsx",
  "apps/stellarc-ui/src/components/project/project-row.tsx",
  "apps/stellarc-ui/src/components/repo/pull-request-live-details.tsx",
  "apps/stellarc-ui/src/components/task/extensions/mention-list.tsx",
  "apps/stellarc-ui/src/components/task/extensions/reference-list.tsx",
  "apps/stellarc-ui/src/components/task/task-details-sheet.tsx",
  "apps/stellarc-ui/src/components/task/task-subtasks.tsx",
  "apps/stellarc-ui/src/components/task/task-title.tsx",
  "apps/stellarc-ui/src/components/ui/breadcrumb.tsx",
]);
const adaptedLintReason =
  "unused biome-ignore removal + mechanical format/import order (brief §5d lint-gate ruling; diff-only vs pinned source)";
const sha256 = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const failures: string[] = [];
let verifiedExact = 0;
const files = [];
const isBinary = (dest: string) =>
  /\.(png|ico|woff2?|jpg|jpeg|gif|webp|svgz)$/.test(dest) ||
  dest.endsWith(".ico");
for (const [destination, source, kind] of mirrors) {
  const committed = isBinary(destination)
    ? gitBinary(["show", `${SHA}:${source}`])
    : git(["show", `${SHA}:${source}`]);
  if (committed.status !== 0) {
    failures.push(`missing in pinned source: ${source}`);
    continue;
  }
  let destBuffer: Buffer;
  try {
    destBuffer = readFileSync(join(worktreeRoot, destination));
  } catch {
    failures.push(`missing in destination: ${destination}`);
    continue;
  }
  const sourceBuffer = committed.stdout as unknown as Buffer;
  const actualKind =
    kind === "exact" && lintAdapted.has(destination) ? "adapted" : kind;
  const entry: Record<string, unknown> = {
    destination,
    source,
    kind: actualKind,
    destinationBytes: destBuffer.length,
  };
  if (actualKind === "adapted" && lintAdapted.has(destination)) {
    entry.adaptation = adaptedLintReason;
    entry.sourceSha256 = sha256(sourceBuffer);
    entry.destinationSha256 = sha256(destBuffer);
  }
  if (actualKind === "exact") {
    const srcHash = sha256(sourceBuffer);
    const destHash = sha256(destBuffer);
    entry.sourceSha256 = srcHash;
    entry.destinationSha256 = destHash;
    if (srcHash !== destHash) {
      failures.push(`byte drift: ${destination} vs ${SHA}:${source}`);
      continue;
    }
    verifiedExact += 1;
  }
  files.push(entry);
}
// And no drifted duplicates: every destination must appear once.
const seen = new Set<string>();
for (const { destination } of files) {
  if (seen.has(destination))
    failures.push(`duplicate mirror entry: ${destination}`);
  seen.add(destination);
}

const manifest = {
  source:
    "https://github.com/kaneo-forks/kaneo (fork lift; local mirror /home/rpw/repos/kaneo)",
  sha: SHA,
  generatedAt: new Date().toISOString(),
  generatedBy: "apps/stellarc-ui/e2e/tools/build-fork-manifest.mts",
  notes: [
    "kind 'exact' = byte-exact production-source mirror (sha256 verified at build time).",
    "kind 'adapted' = lifted then adapted by STL-14 (workspace scripts, aliases, Bun, fixture plumbing); visual surface unchanged.",
    "Fixture endpoints are derived from the lifted fetchers/authClient call sites; e2e/fixtures.ts implements exactly these and fails on unexpected requests.",
    "teams screen is fork-provenance-only (fork route depended on unseeded client state); synthetic coverage arrives with STL-15 domain fixtures.",
  ],
  fixtureEndpoints,
  counts: {
    files: files.length,
    exact: verifiedExact,
    adapted: files.filter((f) => f.kind === "adapted").length,
  },
  files,
};

if (failures.length > 0) {
  console.error(`mirror manifest verification FAILED (${failures.length}):`);
  for (const failure of failures.slice(
    0,
    Number(process.env.MANIFEST_MAX_FAILURES ?? 20),
  ))
    console.error(` - ${failure}`);
  process.exit(1);
}

writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `wrote ${outPath}: ${files.length} files (${verifiedExact} exact verified, ${manifest.counts.adapted} adapted), ${Object.keys(fixtureEndpoints).length} fixture endpoints`,
);
