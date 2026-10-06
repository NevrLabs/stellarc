import { and, asc, eq, inArray, sql } from "drizzle-orm";
import db from "../../database";
import {
  repoIssueTable,
  repoPullRequestTable,
  repoTable,
} from "../../database/schema";

async function listRepos(organizationId: string) {
  const repos = await db
    .select()
    .from(repoTable)
    .where(eq(repoTable.organizationId, organizationId))
    .orderBy(asc(repoTable.owner), asc(repoTable.name));

  const repoIds = repos.map((repo) => repo.id);

  const openIssueCounts =
    repoIds.length > 0
      ? await db
          .select({
            repoId: repoIssueTable.repoId,
            count: sql<number>`count(*)`,
          })
          .from(repoIssueTable)
          .where(
            and(
              inArray(repoIssueTable.repoId, repoIds),
              eq(repoIssueTable.state, "open"),
            ),
          )
          .groupBy(repoIssueTable.repoId)
      : [];

  const openPullRequestCounts =
    repoIds.length > 0
      ? await db
          .select({
            repoId: repoPullRequestTable.repoId,
            count: sql<number>`count(*)`,
          })
          .from(repoPullRequestTable)
          .where(
            and(
              inArray(repoPullRequestTable.repoId, repoIds),
              eq(repoPullRequestTable.state, "open"),
            ),
          )
          .groupBy(repoPullRequestTable.repoId)
      : [];

  const openIssueCountMap = new Map(
    openIssueCounts.map((row) => [row.repoId, Number(row.count ?? 0)]),
  );
  const openPullRequestCountMap = new Map(
    openPullRequestCounts.map((row) => [row.repoId, Number(row.count ?? 0)]),
  );

  return repos.map((repo) => ({
    ...repo,
    openIssueCount: openIssueCountMap.get(repo.id) ?? 0,
    openPullRequestCount: openPullRequestCountMap.get(repo.id) ?? 0,
  }));
}

export default listRepos;
