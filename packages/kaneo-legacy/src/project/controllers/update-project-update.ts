import { eq } from "drizzle-orm";
import db, { schema } from "../../database";
import { publishEvent } from "../../events";
import { appendUpdateEdit } from "../utils/append-update-edit";
import { requireAuthoredUpdate } from "./list-project-updates";
import {
  requireAccessibleProject,
  requireCurrentOrganizationMember,
} from "./update-guards";

export type UpdateUpdateBody = {
  content: string;
  health: "on-track" | "at-risk" | "off-track";
};

/**
 * Author-only edit. Appends a PRE-edit snapshot of the previous content to
 * edit_history before writing the new content (same convention as
 * updateComment). Health MAY change in the same call but is NOT tracked in
 * history — the published health is always the row's current value.
 */
export default async function updateProjectUpdateController(options: {
  organizationId: string;
  projectId: string;
  updateId: string;
  userId: string;
  body: UpdateUpdateBody;
}) {
  await requireCurrentOrganizationMember({
    organizationId: options.organizationId,
    userId: options.userId,
  });
  await requireAccessibleProject({
    organizationId: options.organizationId,
    projectId: options.projectId,
    userId: options.userId,
    edit: true,
  });

  const existing = await requireAuthoredUpdate(options);

  const [updated] = await db
    .update(schema.projectUpdateTable)
    .set({
      content: options.body.content,
      health: options.body.health,
      ...(existing.content === options.body.content
        ? {}
        : {
            editHistory: appendUpdateEdit(
              existing.editHistory ?? [],
              existing.content,
              options.userId,
            ),
          }),
    })
    .where(eq(schema.projectUpdateTable.id, existing.id))
    .returning();

  if (!updated) {
    throw new Error("Failed to update update");
  }

  await publishEvent("project-update.updated", {
    organizationId: updated.organizationId,
    projectId: updated.projectId,
    updateId: updated.id,
    health: updated.health,
  });

  return updated;
}
