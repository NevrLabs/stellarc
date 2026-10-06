import * as v from "valibot";
import type { boardTable, dataTableTable, repoTable } from "../database/schema";

export const PROJECT_RESOURCE_RELATIONSHIPS = [
  "context",
  "dependency",
  "deliverable",
] as const;
export type ProjectResourceRelationship =
  (typeof PROJECT_RESOURCE_RELATIONSHIPS)[number];

export const PROJECT_RESOURCE_TYPES = ["board", "repo", "table"] as const;
export type ProjectResourceType = (typeof PROJECT_RESOURCE_TYPES)[number];

/** Shared Valibot picklist for relationship validation across routes. */
export const projectResourceRelationshipSchema = v.picklist(
  PROJECT_RESOURCE_RELATIONSHIPS,
);

/** Shared Valibot picklist for the controlled resource-type switch. */
export const projectResourceTypeSchema = v.picklist(PROJECT_RESOURCE_TYPES);

/**
 * KFL-368: safe summaries expose only navigational display data already
 * returned by each Resource list API. Repo summaries never include `config`,
 * installation credentials, or provider tokens; table summaries never include
 * fields, rows, or cells.
 */
export const boardSafeSummary = (board: typeof boardTable.$inferSelect) => ({
  id: board.id,
  slug: board.slug,
  name: board.name,
  icon: board.icon,
  archivedAt: board.archivedAt,
});

export const repoSafeSummary = (repo: typeof repoTable.$inferSelect) => ({
  id: repo.id,
  owner: repo.owner,
  name: repo.name,
  provider: repo.provider,
  url: repo.url,
  description: repo.description,
  isActive: repo.isActive,
});

export const tableSafeSummary = (
  table: typeof dataTableTable.$inferSelect,
) => ({
  id: table.id,
  name: table.name,
  icon: table.icon,
});

export function safeSummaryFor(
  resourceType: ProjectResourceType,
  resource:
    | typeof boardTable.$inferSelect
    | typeof repoTable.$inferSelect
    | typeof dataTableTable.$inferSelect,
) {
  switch (resourceType) {
    case "board":
      return boardSafeSummary(resource as typeof boardTable.$inferSelect);
    case "repo":
      return repoSafeSummary(resource as typeof repoTable.$inferSelect);
    case "table":
      return tableSafeSummary(resource as typeof dataTableTable.$inferSelect);
  }
}

export type ProjectResourceLink = {
  id: string;
  projectId: string;
  resourceType: ProjectResourceType;
  resourceId: string;
  relationship: ProjectResourceRelationship;
  label: string | null;
  note: string | null;
  rank: number;
  createdBy: string;
  createdAt: Date;
  resource:
    | ReturnType<typeof boardSafeSummary>
    | ReturnType<typeof repoSafeSummary>
    | ReturnType<typeof tableSafeSummary>;
};

export const projectResourceLinkSchema = v.object({
  id: v.string(),
  projectId: v.string(),
  resourceType: projectResourceTypeSchema,
  resourceId: v.string(),
  relationship: projectResourceRelationshipSchema,
  label: v.nullable(v.string()),
  note: v.nullable(v.string()),
  rank: v.number(),
  createdBy: v.string(),
  createdAt: v.date(),
  resource: v.union([
    v.object({
      id: v.string(),
      slug: v.string(),
      name: v.string(),
      icon: v.nullable(v.string()),
      archivedAt: v.nullable(v.date()),
    }),
    v.object({
      id: v.string(),
      owner: v.string(),
      name: v.string(),
      provider: v.string(),
      url: v.string(),
      description: v.nullable(v.string()),
      isActive: v.boolean(),
    }),
    v.object({
      id: v.string(),
      name: v.string(),
      icon: v.nullable(v.string()),
    }),
  ]),
});
