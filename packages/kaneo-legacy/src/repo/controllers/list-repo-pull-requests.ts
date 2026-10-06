import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import db from "../../database";
import { repoPullRequestTable } from "../../database/schema";
import getRepo from "./get-repo";

type ListRepoPullRequestsOptions = {
  state?: "open" | "closed" | "merged" | "all";
  page?: number;
  limit?: number;
};

async function listRepoPullRequests(
  repoId: string,
  organizationId: string,
  options: ListRepoPullRequestsOptions = {},
) {
  // Scopes the whole query to the caller's organization — throws 404 when the
  // repo belongs to another organization.
  await getRepo(repoId, organizationId);

  const conditions: SQL[] = [eq(repoPullRequestTable.repoId, repoId)];

  const state = options.state ?? "all";
  if (state !== "all") {
    conditions.push(eq(repoPullRequestTable.state, state));
  }

  const whereClause = and(...conditions);

  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize =
    options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
  const offset = (page - 1) * pageSize;

  const [pullRequestCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(repoPullRequestTable)
    .where(whereClause);

  const total = Number(pullRequestCount?.count ?? 0);

  const pullRequests = await db
    .select()
    .from(repoPullRequestTable)
    .where(whereClause)
    .orderBy(desc(repoPullRequestTable.number))
    .limit(pageSize)
    .offset(offset);

  return {
    data: pullRequests,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export default listRepoPullRequests;
