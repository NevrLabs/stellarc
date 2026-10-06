import { and, eq, isNull, sql } from "drizzle-orm";
import db from "../database";
import {
  boardKeyAliasTable,
  boardTable,
  organizationSlugAliasTable,
  organizationTable,
  taskTable,
} from "../database/schema";
import {
  normalizeBoardKey,
  normalizeOrganizationSlug,
  parseTicketKey,
} from "./identity";

export type ResolvedTicketIdentity = {
  ticketId: string;
  ticketKey: string;
  number: number;
  title: string;
  organization: { id: string; slug: string };
  board: { id: string; key: string };
  resolution: {
    usedOrganizationAlias: boolean;
    usedBoardAlias: boolean;
    usedLegacyId: boolean;
  };
};

type OrganizationIdentity = { id: string; slug: string; alias: boolean };
type BoardIdentity = { id: string; slug: string; alias: boolean };
type TicketIdentity = {
  id: string;
  title: string;
  number: number;
  boardId: string;
};

export type TicketIdentityRepository = {
  findOrganization(identifier: string): Promise<OrganizationIdentity | null>;
  findBoard(organizationId: string, key: string): Promise<BoardIdentity | null>;
  findTicketByNumber(
    boardId: string,
    number: number,
  ): Promise<TicketIdentity | null>;
  findTicketById(
    organizationId: string,
    ticketId: string,
  ): Promise<(TicketIdentity & { boardSlug: string }) | null>;
};

export async function resolveTicketIdentity(
  organizationIdentifier: string,
  ticketIdentifier: string,
  repository: TicketIdentityRepository = databaseTicketIdentityRepository,
): Promise<ResolvedTicketIdentity | null> {
  const organization = await repository.findOrganization(
    organizationIdentifier,
  );
  if (!organization) return null;

  const parsed = parseTicketKey(ticketIdentifier);
  if (parsed) {
    const board = await repository.findBoard(
      organization.id,
      normalizeBoardKey(parsed.boardKey),
    );
    if (!board) return null;
    const ticket = await repository.findTicketByNumber(board.id, parsed.number);
    if (!ticket) return null;
    return {
      ticketId: ticket.id,
      ticketKey: `${normalizeBoardKey(board.slug)}-${ticket.number}`,
      number: ticket.number,
      title: ticket.title,
      organization: { id: organization.id, slug: organization.slug },
      board: { id: board.id, key: normalizeBoardKey(board.slug) },
      resolution: {
        usedOrganizationAlias: organization.alias,
        usedBoardAlias: board.alias,
        usedLegacyId: false,
      },
    };
  }

  const ticket = await repository.findTicketById(
    organization.id,
    ticketIdentifier,
  );
  if (!ticket) return null;
  return {
    ticketId: ticket.id,
    ticketKey: `${normalizeBoardKey(ticket.boardSlug)}-${ticket.number}`,
    number: ticket.number,
    title: ticket.title,
    organization: { id: organization.id, slug: organization.slug },
    board: { id: ticket.boardId, key: normalizeBoardKey(ticket.boardSlug) },
    resolution: {
      usedOrganizationAlias: organization.alias,
      usedBoardAlias: false,
      usedLegacyId: true,
    },
  };
}

export const databaseTicketIdentityRepository: TicketIdentityRepository = {
  async findOrganization(identifier) {
    const normalized = normalizeOrganizationSlug(identifier);
    const [current] = await db
      .select({ id: organizationTable.id, slug: organizationTable.slug })
      .from(organizationTable)
      .where(
        sql`lower(${organizationTable.slug}) = ${normalized} OR ${organizationTable.id} = ${identifier}`,
      )
      .limit(1);
    if (current) return { ...current, alias: false };
    const [alias] = await db
      .select({ id: organizationTable.id, slug: organizationTable.slug })
      .from(organizationSlugAliasTable)
      .innerJoin(
        organizationTable,
        eq(organizationSlugAliasTable.organizationId, organizationTable.id),
      )
      .where(sql`lower(${organizationSlugAliasTable.slug}) = ${normalized}`)
      .limit(1);
    return alias ? { ...alias, alias: true } : null;
  },
  async findBoard(organizationId, key) {
    const normalized = key.toLowerCase();
    const [current] = await db
      .select({ id: boardTable.id, slug: boardTable.slug })
      .from(boardTable)
      .where(
        and(
          eq(boardTable.organizationId, organizationId),
          sql`lower(${boardTable.slug}) = ${normalized}`,
        ),
      )
      .limit(1);
    if (current) return { ...current, alias: false };
    const [alias] = await db
      .select({ id: boardTable.id, slug: boardTable.slug })
      .from(boardKeyAliasTable)
      .innerJoin(boardTable, eq(boardKeyAliasTable.boardId, boardTable.id))
      .where(
        and(
          eq(boardKeyAliasTable.organizationId, organizationId),
          sql`lower(${boardKeyAliasTable.key}) = ${normalized}`,
        ),
      )
      .limit(1);
    return alias ? { ...alias, alias: true } : null;
  },
  async findTicketByNumber(boardId, number) {
    const [ticket] = await db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        number: taskTable.number,
        boardId: taskTable.boardId,
      })
      .from(taskTable)
      .where(
        and(
          eq(taskTable.boardId, boardId),
          eq(taskTable.number, number),
          isNull(taskTable.deletedAt),
        ),
      )
      .limit(1);
    return ticket?.number == null ? null : (ticket as TicketIdentity);
  },
  async findTicketById(organizationId, ticketId) {
    const [ticket] = await db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        number: taskTable.number,
        boardId: taskTable.boardId,
        boardSlug: boardTable.slug,
      })
      .from(taskTable)
      .innerJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .where(
        and(
          eq(taskTable.id, ticketId),
          eq(boardTable.organizationId, organizationId),
          isNull(taskTable.deletedAt),
        ),
      )
      .limit(1);
    return ticket?.number == null
      ? null
      : (ticket as TicketIdentity & { boardSlug: string });
  },
};
