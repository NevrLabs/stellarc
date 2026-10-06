import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { organizationGithubInstallationTable } from "../database/schema";
import { getGithubApp } from "../plugins/github/utils/github-app";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import {
  listAdministeredInstallations,
  toInstallationResponse,
} from "./controllers/list-administered-installations";
import {
  buildOrganizationGithubInstallUrl,
  saveOrganizationInstallation,
} from "./install-callback";

const organizationGithub = new Hono<{
  Variables: { organizationId: string; userId: string };
}>()
  .get(
    "/install-url",
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    requireOrganizationPermission({ organization: ["manage_connections"] }),
    (c) =>
      c.json({
        url: buildOrganizationGithubInstallUrl(
          c.get("organizationId"),
          c.get("userId"),
        ),
      }),
  )
  .get(
    "/",
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    async (c) => {
      const organizationId = c.get("organizationId");
      return c.json(
        await db
          .select()
          .from(organizationGithubInstallationTable)
          .where(
            eq(
              organizationGithubInstallationTable.organizationId,
              organizationId,
            ),
          ),
      );
    },
  )
  .get(
    "/available",
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    requireOrganizationPermission({ organization: ["manage_connections"] }),
    async (c) => {
      const installations = await listAdministeredInstallations({
        organizationId: c.get("organizationId"),
        userId: c.get("userId"),
      });
      return c.json(installations.map(toInstallationResponse));
    },
  )
  .post(
    "/",
    validator(
      "json",
      v.object({ organizationId: v.string(), installationId: v.number() }),
    ),
    organizationAccess.fromBody(),
    requireOrganizationPermission({ organization: ["manage_connections"] }),
    async (c) => {
      const { organizationId, installationId } = c.req.valid("json");
      const userId = c.get("userId");
      const app = getGithubApp();
      if (!app)
        throw new HTTPException(503, {
          message: "GitHub App is not configured",
        });

      // Defence in depth: the UI only offers installations the user
      // administers, but the endpoint must enforce it too, or any org could
      // claim any installation by calling this directly.
      const administered = await listAdministeredInstallations({
        organizationId,
        userId,
      });
      if (!administered.some((i) => i.id === installationId)) {
        throw new HTTPException(403, {
          message: "You do not administer this GitHub App installation",
        });
      }

      return c.json(
        await saveOrganizationInstallation(organizationId, installationId),
      );
    },
  )
  .get(
    "/repositories",
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    async (c) => {
      const organizationId = c.get("organizationId");
      const installations = await db
        .select()
        .from(organizationGithubInstallationTable)
        .where(
          eq(
            organizationGithubInstallationTable.organizationId,
            organizationId,
          ),
        );
      const app = getGithubApp();
      if (!app)
        throw new HTTPException(503, {
          message: "GitHub App is not configured",
        });
      const repositories = [] as unknown[];
      for (const installation of installations) {
        const octokit = await app.getInstallationOctokit(
          installation.installationId,
        );
        const repos = await octokit.paginate(
          octokit.rest.apps.listReposAccessibleToInstallation,
          { per_page: 100 },
        );
        repositories.push(
          ...repos.map((repo) => ({
            id: repo.id,
            owner: repo.owner.login,
            name: repo.name,
            fullName: repo.full_name,
            url: repo.html_url,
            description: repo.description,
            isPrivate: repo.private,
            defaultBranch: repo.default_branch,
            installationId: installation.installationId,
          })),
        );
      }
      return c.json(repositories);
    },
  )
  .delete(
    "/:installationId",
    validator(
      "param",
      v.object({ installationId: v.pipe(v.string(), v.transform(Number)) }),
    ),
    validator("query", v.object({ organizationId: v.string() })),
    organizationAccess.fromQuery(),
    requireOrganizationPermission({ organization: ["manage_connections"] }),
    async (c) => {
      const { installationId } = c.req.valid("param");
      const organizationId = c.get("organizationId");
      await db
        .delete(organizationGithubInstallationTable)
        .where(
          and(
            eq(
              organizationGithubInstallationTable.organizationId,
              organizationId,
            ),
            eq(
              organizationGithubInstallationTable.installationId,
              installationId,
            ),
          ),
        );
      return c.json({ success: true });
    },
  );
export default organizationGithub;
