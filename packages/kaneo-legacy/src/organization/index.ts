import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { listIdentityAliases } from "../identity/list-identity-aliases";
import { renameOrganizationSlug } from "../identity/rename-identity";
import { resolveTicketIdentity } from "../identity/resolve-ticket-identity";
import { getResourcePrivilege, privilegeAllows } from "../resource-access";
import { isInstanceAdmin } from "../utils/is-instance-admin";
import { organizationAccess } from "../utils/organization-access-middleware";
import { requireOrganizationPermission } from "../utils/require-organization-permission";
import { validateOrganizationAccess } from "../utils/validate-organization-access";
import getOrganizationMembersCtrl from "./controllers/get-organization-members";
import getOrganizationPrincipalsCtrl from "./controllers/get-organization-principals";
import listOrganizationsCtrl from "./controllers/list-organizations";
import {
  getVisibilityDefaults,
  updateVisibilityDefaults,
  visibilityDefaultsBodySchema,
} from "./controllers/visibility-defaults";

const organization = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
    apiKey: { id: string; metadata?: string | null } | null;
  };
}>()
  .get(
    "/:organizationSlug/ticket/:ticketKey",
    describeRoute({
      operationId: "resolveTicketIdentity",
      tags: ["Tickets"],
      description:
        "Resolve a canonical or historical ticket key, with legacy opaque-ID fallback",
      responses: {
        200: { description: "Canonical ticket identity" },
        404: { description: "Ticket not found" },
      },
    }),
    validator(
      "param",
      v.object({ organizationSlug: v.string(), ticketKey: v.string() }),
    ),
    async (c) => {
      const { organizationSlug, ticketKey } = c.req.valid("param");
      const identity = await resolveTicketIdentity(organizationSlug, ticketKey);
      if (!identity) {
        throw new HTTPException(404, { message: "Ticket not found" });
      }

      try {
        await validateOrganizationAccess(
          c.get("userId"),
          identity.organization.id,
          c.get("apiKey")?.id,
        );
        const privilege = await getResourcePrivilege({
          organizationId: identity.organization.id,
          resourceType: "board",
          resourceId: identity.board.id,
          userId: c.get("userId"),
        });
        if (!privilegeAllows(privilege, "view")) throw new Error("denied");
      } catch {
        throw new HTTPException(404, { message: "Ticket not found" });
      }

      return c.json(identity);
    },
  )
  .get(
    "/:organizationId/identity-aliases",
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const inventory = await listIdentityAliases(c.get("organizationId"));
      if (!inventory) {
        throw new HTTPException(404, { message: "Organization not found" });
      }
      return c.json(inventory);
    },
  )
  .put(
    "/:organizationId/slug",
    validator("param", v.object({ organizationId: v.string() })),
    validator("json", v.object({ slug: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      if (!(await isInstanceAdmin(c))) {
        throw new HTTPException(403, {
          message: "Instance administrator required",
        });
      }
      return c.json(
        await renameOrganizationSlug(
          c.get("organizationId"),
          c.req.valid("json").slug,
        ),
      );
    },
  )
  .get(
    "/",
    describeRoute({
      operationId: "listOrganizations",
      tags: ["Organizations"],
      description:
        "List organizations the authenticated principal can access. Works for user sessions AND agent/API keys — agent keys see only the organization they are scoped to. (The Better Auth /api/auth/organization/list route is session-only, which left agents unable to discover organization ids.)",
      responses: {
        200: {
          description: "Organizations visible to the caller",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    slug: v.string(),
                    logo: v.nullable(v.string()),
                    role: v.optional(v.string()),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    async (c) => {
      const userId = c.get("userId");
      const apiKey = c.get("apiKey");
      return c.json(await listOrganizationsCtrl(userId, apiKey?.metadata));
    },
  )
  .get(
    "/:organizationId/members",
    describeRoute({
      operationId: "getOrganizationMembers",
      tags: ["Organizations"],
      description: "Get all members of a organization",
      responses: {
        200: {
          description: "List of organization members",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    email: v.string(),
                    image: v.nullable(v.string()),
                    role: v.string(),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) => {
      const organizationId = c.get("organizationId");
      const members = await getOrganizationMembersCtrl(organizationId);
      return c.json(members);
    },
  )
  .get(
    "/:organizationId/principals",
    describeRoute({
      operationId: "getOrganizationPrincipals",
      tags: ["Organizations"],
      description:
        'List the organization\'s member principals with an explicit `kind` discriminator ("user" or "agent"). Better Auth\'s organization listMembers hard-codes its user projection to {id,name,email,image}, stripping `user.role`, so clients cannot otherwise tell agent principals from human members.',
      responses: {
        200: {
          description: "List of organization principals",
          content: {
            "application/json": {
              schema: resolver(
                v.array(
                  v.object({
                    id: v.string(),
                    name: v.string(),
                    email: v.string(),
                    image: v.nullable(v.string()),
                    kind: v.picklist(["user", "agent"]),
                  }),
                ),
              ),
            },
          },
        },
      },
    }),
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    async (c) =>
      c.json(await getOrganizationPrincipalsCtrl(c.get("organizationId"))),
  )
  .get(
    "/:organizationId/visibility-defaults",
    describeRoute({
      operationId: "getOrganizationVisibilityDefaults",
      tags: ["Organizations"],
      description:
        "Read the organization-wide default member privilege and the optional per-resource-type overrides. Requires manage_settings because the page it backs is the settings editor.",
      responses: { 200: { description: "Visibility defaults" } },
    }),
    validator("param", v.object({ organizationId: v.string() })),
    organizationAccess.fromParam("organizationId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) => c.json(await getVisibilityDefaults(c.get("organizationId"))),
  )
  .put(
    "/:organizationId/visibility-defaults",
    describeRoute({
      operationId: "updateOrganizationVisibilityDefaults",
      tags: ["Organizations"],
      description:
        "Update the org-wide default privilege and per-resource-type overrides (absent key = inherit). Owners/admins always retain manage regardless of these defaults.",
      responses: { 200: { description: "Updated visibility defaults" } },
    }),
    validator("param", v.object({ organizationId: v.string() })),
    validator("json", visibilityDefaultsBodySchema),
    organizationAccess.fromParam("organizationId"),
    requireOrganizationPermission({ organization: ["manage_settings"] }),
    async (c) =>
      c.json(
        await updateVisibilityDefaults(
          c.get("organizationId"),
          c.req.valid("json"),
        ),
      ),
  );

export default organization;
