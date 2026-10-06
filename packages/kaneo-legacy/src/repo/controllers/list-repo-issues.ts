import { and, desc, eq, type SQL, sql } from "drizzle-orm";
import db from "../../database";
import { repoIssueTable } from "../../database/schema";
import getRepo from "./get-repo";

type ListRepoIssuesOptions = {
  state?: "open" | "closed" | "all";
  page?: number;
  limit?: number;
};

async function listRepoIssues(
  repoId: string,
  organizationId: string,
  options: ListRepoIssuesOptions = {},
) {
  // Scopes the whole query to the caller's organization — throws 404 when the
  // repo belongs to another organization.
  await getRepo(repoId, organizationId);

  const conditions: SQL[] = [eq(repoIssueTable.repoId, repoId)];

  const state = options.state ?? "all";
  if (state !== "all") {
    conditions.push(eq(repoIssueTable.state, state));
  }

  const whereClause = and(...conditions);

  const page = options.page && options.page > 0 ? options.page : 1;
  const pageSize =
    options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 50;
  const offset = (page - 1) * pageSize;

  const [issueCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(repoIssueTable)
    .where(whereClause);

  const total = Number(issueCount?.count ?? 0);

  const issues = await db
    .select()
    .from(repoIssueTable)
    .where(whereClause)
    .orderBy(desc(repoIssueTable.number))
    .limit(pageSize)
    .offset(offset);

  return {
    data: issues,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export default listRepoIssues;
