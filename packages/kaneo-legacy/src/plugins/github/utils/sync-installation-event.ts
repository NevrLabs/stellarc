import { eq } from "drizzle-orm";
import db from "../../../database";
import { organizationGithubInstallationTable } from "../../../database/schema";

type InstallationEventPayload = {
  action?: unknown;
  installation?: {
    id?: unknown;
    account?: {
      id?: unknown;
      login?: unknown;
      type?: unknown;
      avatar_url?: unknown;
    } | null;
    repository_selection?: unknown;
    permissions?: unknown;
  };
};

function readInstallationEvent(payload: unknown): {
  action: string;
  installationId: number;
  account: {
    id: number | null;
    login: string | null;
    type: string | null;
    avatarUrl: string | null;
  };
  repositorySelection: string | null;
  permissions: Record<string, string> | null;
} | null {
  if (!payload || typeof payload !== "object") return null;

  const { action, installation } = payload as InstallationEventPayload;
  if (typeof action !== "string" || !installation) return null;

  const installationId =
    typeof installation.id === "number" ? installation.id : null;
  if (installationId === null) return null;

  const account = installation.account ?? null;

  return {
    action,
    installationId,
    account: {
      id: typeof account?.id === "number" ? account.id : null,
      login: typeof account?.login === "string" ? account.login : null,
      type: typeof account?.type === "string" ? account.type : null,
      avatarUrl:
        typeof account?.avatar_url === "string" ? account.avatar_url : null,
    },
    repositorySelection:
      typeof installation.repository_selection === "string"
        ? installation.repository_selection
        : null,
    permissions:
      installation.permissions && typeof installation.permissions === "object"
        ? (installation.permissions as Record<string, string>)
        : null,
  };
}

/**
 * Keep `organization_github_installation` honest about what GitHub actually has.
 *
 * GitHub mints a brand new installation ID on every install, so an uninstall
 * leaves a permanently dead row behind. That dead row kept being handed to
 * `getInstallationOctokit()`, which 404s on `/app/installations/{id}/access_tokens`,
 * and it also made the org look "already connected" so the reinstalled account
 * was never registered. Deleting on uninstall is what makes reinstall work.
 *
 * Returns true when the event was an installation lifecycle event we consumed.
 */
export async function syncGitHubInstallationEvent(
  eventName: string,
  payload: unknown,
): Promise<boolean> {
  if (eventName !== "installation") return false;

  const event = readInstallationEvent(payload);
  if (!event) return false;

  if (event.action === "deleted") {
    await db
      .delete(organizationGithubInstallationTable)
      .where(
        eq(
          organizationGithubInstallationTable.installationId,
          event.installationId,
        ),
      );
    return true;
  }

  // Any other lifecycle action (suspend, unsuspend, new_permissions_accepted)
  // only refreshes metadata for rows an admin already linked. It never creates
  // a row: a webhook carries no Kaneo organization context, so ownership is
  // only ever established through the authenticated connect endpoint.
  await db
    .update(organizationGithubInstallationTable)
    .set({
      ...(event.account.login ? { accountLogin: event.account.login } : {}),
      ...(event.account.type ? { accountType: event.account.type } : {}),
      accountAvatarUrl: event.account.avatarUrl,
      repositorySelection: event.repositorySelection,
      permissions: event.permissions,
      updatedAt: new Date(),
    })
    .where(
      eq(
        organizationGithubInstallationTable.installationId,
        event.installationId,
      ),
    );

  return true;
}
