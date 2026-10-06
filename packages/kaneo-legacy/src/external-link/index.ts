import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import { externalLinkTable } from "../database/schema";
import { organizationAccess } from "../utils/organization-access-middleware";

const externalLinkSchema = v.object({
  id: v.string(),
  taskId: v.string(),
  integrationId: v.nullable(v.string()),
  resourceType: v.string(),
  externalId: v.string(),
  url: v.string(),
  title: v.nullable(v.string()),
  metadata: v.any(),
  createdAt: v.date(),
  updatedAt: v.date(),
});

/**
 * #265: a resource is literally a link to wherever something already lives.
 *
 * Manual links are stored in the same table as integration-owned ones so the
 * Resources list has a single source: `integrationId` is null for a manual link,
 * `externalId` holds the URL (its own identifier), and `resourceType` is "link".
 *
 * Deliberately NOT built here: object storage, upload accounting, or
 * deduplication. A resource records *where* something is, not the bytes.
 */
export const MANUAL_RESOURCE_TYPE = "link";

/**
 * Only http(s) is accepted. A resource is rendered as a user-clickable
 * anchor, so permitting `javascript:` or `data:` would turn the Resources
 * list into a stored-XSS vector.
 */
const httpUrl = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "A URL is required"),
  v.maxLength(2048, "URL is too long"),
  v.check((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "Must be a valid http(s) URL"),
);

const externalLink = new Hono<{
  Variables: {
    userId: string;
    organizationId: string;
  };
}>()
  .get(
    "/task/:taskId",
    describeRoute({
      operationId: "getExternalLinksByTask",
      tags: ["External Links"],
      description: "Get all external links for a task",
      responses: {
        200: {
          description: "External links for the task",
          content: {
            "application/json": {
              schema: resolver(v.array(externalLinkSchema)),
            },
          },
        },
      },
    }),
    validator("param", v.object({ taskId: v.string() })),
    organizationAccess.fromTaskId("taskId"),
    async (c) => {
      const { taskId } = c.req.valid("param");

      const links = await db.query.externalLinkTable.findMany({
        where: eq(externalLinkTable.taskId, taskId),
        with: {
          // Never widen this: integration.config holds plaintext provider
          // secrets and this route is reachable by any workspace member.
          integration: { columns: { id: true, type: true } },
        },
      });

      const formattedLinks = links.map((link) => ({
        ...link,
        metadata: link.metadata ? JSON.parse(link.metadata) : null,
      }));

      return c.json(formattedLinks);
    },
  )
  .post(
    "/",
    describeRoute({
      operationId: "createManualResourceLink",
      tags: ["External Links"],
      description: "Attach a plain link to a task as a resource",
      responses: {
        200: {
          description: "The created resource link",
          content: {
            "application/json": {
              schema: resolver(externalLinkSchema),
            },
          },
        },
      },
    }),
    validator(
      "json",
      v.object({
        taskId: v.string(),
        url: httpUrl,
        title: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(512)))),
      }),
    ),
    organizationAccess.fromTaskId("taskId"),
    async (c) => {
      const { taskId, url, title } = c.req.valid("json");

      // Re-adding a URL the task already carries is a no-op rather than an
      // error: the same link can legitimately arrive from the description and
      // from a manual add, and the user asked for links, not a conflict dialog.
      const existing = await db.query.externalLinkTable.findFirst({
        where: and(
          eq(externalLinkTable.taskId, taskId),
          eq(externalLinkTable.url, url),
        ),
      });

      if (existing) {
        return c.json({
          ...existing,
          metadata: existing.metadata ? JSON.parse(existing.metadata) : null,
        });
      }

      const trimmedTitle = title?.trim();

      const [created] = await db
        .insert(externalLinkTable)
        .values({
          taskId,
          integrationId: null,
          // The URL is the manual link's own identifier; `externalId` stays
          // NOT NULL so integration sync paths can keep treating it as a string.
          externalId: url,
          resourceType: MANUAL_RESOURCE_TYPE,
          url,
          title: trimmedTitle ? trimmedTitle : null,
        })
        .returning();

      return c.json({ ...created, metadata: null });
    },
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "deleteManualResourceLink",
      tags: ["External Links"],
      description: "Remove a manually added resource link from a task",
      responses: {
        200: {
          description: "Deletion result",
          content: {
            "application/json": {
              schema: resolver(v.object({ success: v.boolean() })),
            },
          },
        },
      },
    }),
    validator("param", v.object({ id: v.string() })),
    // The gate needs a task id, but only the row knows which task it belongs
    // to, and `organizationAccess` resolves ids from param/query/body only --
    // it cannot see `c.set()` values. So the client passes `taskId` and the
    // SAME middleware as every other task-scoped route runs unchanged; the
    // handler then proves the link really belongs to that task, so a forged
    // `taskId` cannot be used to reach another task's link.
    validator("query", v.object({ taskId: v.string() })),
    organizationAccess.fromTaskId("taskId"),
    async (c) => {
      const { id } = c.req.valid("param");
      const { taskId } = c.req.valid("query");

      const link = await db.query.externalLinkTable.findFirst({
        where: eq(externalLinkTable.id, id),
      });

      if (!link || link.taskId !== taskId) {
        throw new HTTPException(404, { message: "Resource link not found" });
      }

      // Integration-owned rows are maintained by the sync, not by hand:
      // deleting one here would silently desync the task from its upstream
      // issue and the row would simply reappear on the next webhook.
      if (link.resourceType !== MANUAL_RESOURCE_TYPE) {
        throw new HTTPException(400, {
          message: "Only manually added resource links can be removed",
        });
      }

      await db
        .delete(externalLinkTable)
        .where(
          and(
            eq(externalLinkTable.id, id),
            eq(externalLinkTable.resourceType, MANUAL_RESOURCE_TYPE),
          ),
        );

      return c.json({ success: true });
    },
  );

export default externalLink;
