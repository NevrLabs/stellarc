import { asc, eq } from "drizzle-orm";
import db from "../database";
import {
  boardKeyAliasTable,
  boardTable,
  organizationSlugAliasTable,
  organizationTable,
} from "../database/schema";

export type IdentityAliasInventory = {
  organization: { currentSlug: string; aliases: string[] };
  boards: Array<{
    boardId: string;
    boardName: string;
    currentKey: string;
    aliases: string[];
  }>;
};

export type IdentityAliasRepository = {
  findOrganization(id: string): Promise<{ id: string; slug: string } | null>;
  listOrganizationAliases(id: string): Promise<string[]>;
  listBoards(
    id: string,
  ): Promise<Array<{ id: string; name: string; key: string }>>;
  listBoardAliases(
    id: string,
  ): Promise<Array<{ boardId: string; key: string }>>;
};

export async function listIdentityAliases(
  organizationId: string,
  repository: IdentityAliasRepository = databaseIdentityAliasRepository,
): Promise<IdentityAliasInventory | null> {
  const organization = await repository.findOrganization(organizationId);
  if (!organization) return null;

  const [aliases, boards, boardAliases] = await Promise.all([
    repository.listOrganizationAliases(organization.id),
    repository.listBoards(organization.id),
    repository.listBoardAliases(organization.id),
  ]);

  return {
    organization: {
      currentSlug: organization.slug,
      aliases: aliases.sort((a, b) => a.localeCompare(b)),
    },
    boards: boards
      .map((board) => ({
        boardId: board.id,
        boardName: board.name,
        currentKey: board.key,
        aliases: boardAliases
          .filter((alias) => alias.boardId === board.id)
          .map((alias) => alias.key)
          .sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.boardName.localeCompare(b.boardName)),
  };
}

export const databaseIdentityAliasRepository: IdentityAliasRepository = {
  async findOrganization(id) {
    const [organization] = await db
      .select({ id: organizationTable.id, slug: organizationTable.slug })
      .from(organizationTable)
      .where(eq(organizationTable.id, id))
      .limit(1);
    return organization ?? null;
  },
  async listOrganizationAliases(id) {
    const rows = await db
      .select({ slug: organizationSlugAliasTable.slug })
      .from(organizationSlugAliasTable)
      .where(eq(organizationSlugAliasTable.organizationId, id))
      .orderBy(asc(organizationSlugAliasTable.slug));
    return rows.map((row) => row.slug);
  },
  async listBoards(id) {
    const rows = await db
      .select({
        id: boardTable.id,
        name: boardTable.name,
        key: boardTable.slug,
      })
      .from(boardTable)
      .where(eq(boardTable.organizationId, id))
      .orderBy(asc(boardTable.name));
    return rows;
  },
  async listBoardAliases(id) {
    return db
      .select({
        boardId: boardKeyAliasTable.boardId,
        key: boardKeyAliasTable.key,
      })
      .from(boardKeyAliasTable)
      .where(eq(boardKeyAliasTable.organizationId, id))
      .orderBy(asc(boardKeyAliasTable.key));
  },
};
