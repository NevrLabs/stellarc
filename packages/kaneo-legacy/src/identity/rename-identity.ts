import { and, eq, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  boardKeyAliasTable,
  boardTable,
  organizationSlugAliasTable,
  organizationTable,
  projectSlugAliasTable,
  projectTable,
} from "../database/schema";
import {
  normalizeBoardKey,
  normalizeOrganizationSlug,
  normalizeProjectSlug,
} from "./identity";

const ORGANIZATION_SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const BOARD_KEY = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const PROJECT_SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export async function renameOrganizationSlug(
  organizationId: string,
  requestedSlug: string,
) {
  const slug = normalizeOrganizationSlug(requestedSlug);
  if (slug.length < 2 || slug.length > 63 || !ORGANIZATION_SLUG.test(slug)) {
    throw new HTTPException(400, { message: "Invalid organization slug" });
  }
  return db.transaction(async (tx) => {
    const [organization] = await tx
      .select({ id: organizationTable.id, slug: organizationTable.slug })
      .from(organizationTable)
      .where(eq(organizationTable.id, organizationId))
      .for("update")
      .limit(1);
    if (!organization)
      throw new HTTPException(404, { message: "Organization not found" });
    if (normalizeOrganizationSlug(organization.slug) === slug)
      return organization;

    const [currentOwner] = await tx
      .select({ id: organizationTable.id })
      .from(organizationTable)
      .where(
        and(
          sql`lower(${organizationTable.slug}) = ${slug}`,
          ne(organizationTable.id, organizationId),
        ),
      )
      .limit(1);
    const [aliasOwner] = await tx
      .select({ organizationId: organizationSlugAliasTable.organizationId })
      .from(organizationSlugAliasTable)
      .where(sql`lower(${organizationSlugAliasTable.slug}) = ${slug}`)
      .limit(1);
    if (
      currentOwner ||
      (aliasOwner && aliasOwner.organizationId !== organizationId)
    ) {
      throw new HTTPException(409, {
        message: "Organization slug is already reserved",
      });
    }

    await tx
      .insert(organizationSlugAliasTable)
      .values({ organizationId, slug: organization.slug })
      .onConflictDoNothing();
    await tx
      .delete(organizationSlugAliasTable)
      .where(
        and(
          eq(organizationSlugAliasTable.organizationId, organizationId),
          sql`lower(${organizationSlugAliasTable.slug}) = ${slug}`,
        ),
      );
    const [updated] = await tx
      .update(organizationTable)
      .set({ slug })
      .where(eq(organizationTable.id, organizationId))
      .returning({ id: organizationTable.id, slug: organizationTable.slug });
    return updated;
  });
}

export async function renameBoardKey(
  boardId: string,
  organizationId: string,
  requestedKey: string,
) {
  const key = normalizeBoardKey(requestedKey);
  if (key.length < 2 || key.length > 20 || !BOARD_KEY.test(key)) {
    throw new HTTPException(400, { message: "Invalid board key" });
  }
  return db.transaction(async (tx) => {
    const [board] = await tx
      .select({ id: boardTable.id, slug: boardTable.slug })
      .from(boardTable)
      .where(
        and(
          eq(boardTable.id, boardId),
          eq(boardTable.organizationId, organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!board) throw new HTTPException(404, { message: "Board not found" });
    if (normalizeBoardKey(board.slug) === key) return { id: board.id, key };

    const normalized = key.toLowerCase();
    const [currentOwner] = await tx
      .select({ id: boardTable.id })
      .from(boardTable)
      .where(
        and(
          eq(boardTable.organizationId, organizationId),
          sql`lower(${boardTable.slug}) = ${normalized}`,
          ne(boardTable.id, boardId),
        ),
      )
      .limit(1);
    const [aliasOwner] = await tx
      .select({ boardId: boardKeyAliasTable.boardId })
      .from(boardKeyAliasTable)
      .where(
        and(
          eq(boardKeyAliasTable.organizationId, organizationId),
          sql`lower(${boardKeyAliasTable.key}) = ${normalized}`,
        ),
      )
      .limit(1);
    if (currentOwner || (aliasOwner && aliasOwner.boardId !== boardId)) {
      throw new HTTPException(409, {
        message: "Board key is already reserved",
      });
    }

    await tx
      .insert(boardKeyAliasTable)
      .values({ organizationId, boardId, key: board.slug })
      .onConflictDoNothing();
    await tx
      .delete(boardKeyAliasTable)
      .where(
        and(
          eq(boardKeyAliasTable.boardId, boardId),
          sql`lower(${boardKeyAliasTable.key}) = ${normalized}`,
        ),
      );
    const [updated] = await tx
      .update(boardTable)
      .set({ slug: key })
      .where(eq(boardTable.id, boardId))
      .returning({ id: boardTable.id, key: boardTable.slug });
    return updated;
  });
}

export async function renameProjectSlug(
  projectId: string,
  organizationId: string,
  requestedSlug: string,
) {
  const slug = normalizeProjectSlug(requestedSlug);
  if (slug.length < 2 || slug.length > 63 || !PROJECT_SLUG.test(slug)) {
    throw new HTTPException(400, { message: "Invalid project slug" });
  }
  return db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projectTable.id, slug: projectTable.slug })
      .from(projectTable)
      .where(
        and(
          eq(projectTable.id, projectId),
          eq(projectTable.organizationId, organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!project)
      throw new HTTPException(404, { message: "Project not found" });
    if (normalizeProjectSlug(project.slug) === slug)
      return { id: project.id, slug };

    const [currentOwner] = await tx
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(
        and(
          eq(projectTable.organizationId, organizationId),
          sql`lower(${projectTable.slug}) = ${slug}`,
          ne(projectTable.id, projectId),
        ),
      )
      .limit(1);
    const [aliasOwner] = await tx
      .select({ projectId: projectSlugAliasTable.projectId })
      .from(projectSlugAliasTable)
      .where(
        and(
          eq(projectSlugAliasTable.organizationId, organizationId),
          sql`lower(${projectSlugAliasTable.slug}) = ${slug}`,
        ),
      )
      .limit(1);
    if (currentOwner || (aliasOwner && aliasOwner.projectId !== projectId)) {
      throw new HTTPException(409, {
        message: "Project slug is already reserved",
      });
    }

    await tx
      .insert(projectSlugAliasTable)
      .values({ organizationId, projectId, slug: project.slug })
      .onConflictDoNothing();
    await tx
      .delete(projectSlugAliasTable)
      .where(
        and(
          eq(projectSlugAliasTable.projectId, projectId),
          sql`lower(${projectSlugAliasTable.slug}) = ${slug}`,
        ),
      );
    const [updated] = await tx
      .update(projectTable)
      .set({ slug })
      .where(eq(projectTable.id, projectId))
      .returning({ id: projectTable.id, slug: projectTable.slug });
    return updated;
  });
}
