import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { repoPullRequestTable } from "../../database/schema";
import { getRepoItemTaskLinks } from "./repo-task-links";

export async function getRepoPullRequest(
  repoId: string,
  number: number,
  organizationId?: string,
) {
  const pullRequest = await db.query.repoPullRequestTable.findFirst({
    where: and(
      eq(repoPullRequestTable.repoId, repoId),
      eq(repoPullRequestTable.number, number),
    ),
  });
  if (!pullRequest)
    throw new HTTPException(404, { message: "Pull request not found" });
  return {
    ...pullRequest,
    taskLinks: organizationId
      ? await getRepoItemTaskLinks(
          repoId,
          number,
          "pullRequest",
          organizationId,
        )
      : [],
  };
}
