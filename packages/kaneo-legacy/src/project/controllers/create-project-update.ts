import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { publishEvent } from "../../events";
import {
  requireAccessibleProject,
  requireCurrentOrganizationMember,
} from "./update-guards";

export type CreateUpdateBody = {
  content: string;
  health: "on-track" | "at-risk" | "off-track";
};

export default async function createProjectUpdateController(options: {
  organizationId: string;
  projectId: string;
  userId: string;
  body: CreateUpdateBody;
}) {
  await requireCurrentOrganizationMember({
    organizationId: options.organizationId,
    userId: options.userId,
  });
  // edit privilege gates posting; view is NOT enough.
  await requireAccessibleProject({
    organizationId: options.organizationId,
    projectId: options.projectId,
    userId: options.userId,
    edit: true,
  });

  const [created] = await db
    .insert(schema.projectUpdateTable)
    .values({
      organizationId: options.organizationId,
      projectId: options.projectId,
      authorId: options.userId,
      content: options.body.content,
      health: options.body.health,
    })
    .returning();

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create update" });
  }

  await publishEvent("project-update.created", {
    organizationId: created.organizationId,
    projectId: created.projectId,
    updateId: created.id,
    health: created.health,
  });

  return created;
}
