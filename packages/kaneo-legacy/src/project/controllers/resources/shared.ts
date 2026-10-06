import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  boardTable,
  dataTableTable,
  projectBoardTable,
  projectRepoTable,
  projectTableLinkTable,
  repoTable,
} from "../../../database/schema";
import { requireResourcePrivilege } from "../../../resource-access";
import type { ProjectResourceType } from "../../project-resource-projection";

/** Controlled switch: exactly one typed association table per resource type. */
export const LINK_TABLE = {
  board: projectBoardTable,
  repo: projectRepoTable,
  table: projectTableLinkTable,
} as const;

export const RESOURCE_ID_COLUMN = {
  board: "boardId",
  repo: "repoId",
  table: "tableId",
} as const;

export const RESOURCE_TABLE = {
  board: boardTable,
  repo: repoTable,
  table: dataTableTable,
} as const;

/** Same-organization existence check; returns the typed Resource row or null. */
export async function findResourceByType(
  organizationId: string,
  resourceType: ProjectResourceType,
  resourceId: string,
) {
  const table = RESOURCE_TABLE[resourceType];
  const [row] = await db
    .select()
    .from(table)
    .where(
      and(eq(table.id, resourceId), eq(table.organizationId, organizationId)),
    )
    .limit(1);
  return row ?? null;
}

/** Trim optional display metadata; blank normalizes to NULL. */
export function normalizeNullable(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  if ("cause" in error) return isUniqueViolation(error.cause);
  return false;
}

export const resourceNotFound = () =>
  new HTTPException(404, { message: "Resource not found" });

/**
 * KFL-368 Project guard: resource-privilege lattice on the Project itself
 * (beyond the organization-level `project:*` permission), matching the
 * no-leak convention of hiding an inaccessible Project with a uniform 404.
 */
export async function assertProjectPrivilege(
  organizationId: string,
  projectId: string,
  userId: string,
  required: "view" | "edit",
): Promise<void> {
  const allowed = await requireResourcePrivilege({
    organizationId,
    resourceType: "project",
    resourceId: projectId,
    userId,
    required,
  });
  if (!allowed) {
    throw new HTTPException(404, { message: "Project not found" });
  }
}
