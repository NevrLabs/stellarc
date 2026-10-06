import { and, eq } from "drizzle-orm";
import db from "../../../database";
import {
  repoIssueTable,
  repoTable,
  taskRepoItemLinkTable,
} from "../../../database/schema";

export async function handleIssueDeleted(payload: {
  issue: { number: number };
  repository: { owner: { login: string }; name: string };
}) {
  const [issue] = await db
    .select({ id: repoIssueTable.id })
    .from(repoIssueTable)
    .innerJoin(repoTable, eq(repoIssueTable.repoId, repoTable.id))
    .where(
      and(
        eq(repoTable.owner, payload.repository.owner.login),
        eq(repoTable.name, payload.repository.name),
        eq(repoIssueTable.number, payload.issue.number),
      ),
    )
    .limit(1);
  if (!issue) return;
  await db
    .update(taskRepoItemLinkTable)
    .set({
      syncBrokenAt: new Date(),
      syncBrokenReason: "issue deleted on GitHub",
    })
    .where(
      and(
        eq(taskRepoItemLinkTable.repoIssueId, issue.id),
        eq(taskRepoItemLinkTable.syncEnabled, true),
      ),
    );
}
