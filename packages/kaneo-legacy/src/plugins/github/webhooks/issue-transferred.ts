import { and, eq } from "drizzle-orm";
import db from "../../../database";
import {
  repoIssueTable,
  repoTable,
  taskRepoItemLinkTable,
} from "../../../database/schema";

export async function handleIssueTransferred(payload: {
  issue: { number: number };
  repository: { id?: number; owner: { login: string }; name: string };
  changes?: {
    new_issue?: { number: number };
    new_repository?: { id?: number; owner?: { login: string }; name?: string };
  };
}) {
  const destination = payload.changes?.new_repository;
  const newIssue = payload.changes?.new_issue;
  if (!destination || !newIssue) return;
  const [oldIssue] = await db
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
  if (!oldIssue) return;
  const [newRepo] = await db
    .select({ id: repoTable.id })
    .from(repoTable)
    .where(
      and(
        eq(repoTable.owner, destination.owner?.login ?? ""),
        eq(repoTable.name, destination.name ?? ""),
      ),
    )
    .limit(1);
  const [newMirror] = newRepo
    ? await db
        .select({ id: repoIssueTable.id })
        .from(repoIssueTable)
        .where(
          and(
            eq(repoIssueTable.repoId, newRepo.id),
            eq(repoIssueTable.number, newIssue.number),
          ),
        )
        .limit(1)
    : [];
  if (newMirror) {
    await db
      .update(taskRepoItemLinkTable)
      .set({
        repoIssueId: newMirror.id,
        syncBrokenAt: null,
        syncBrokenReason: null,
      })
      .where(
        and(
          eq(taskRepoItemLinkTable.repoIssueId, oldIssue.id),
          eq(taskRepoItemLinkTable.syncEnabled, true),
        ),
      );
  } else {
    await db
      .update(taskRepoItemLinkTable)
      .set({
        syncBrokenAt: new Date(),
        syncBrokenReason: "issue moved to an unmirrored repository",
      })
      .where(
        and(
          eq(taskRepoItemLinkTable.repoIssueId, oldIssue.id),
          eq(taskRepoItemLinkTable.syncEnabled, true),
        ),
      );
  }
}
