import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import db from "../../database";
import {
  activityTable,
  boardTable,
  organizationMemberTable,
  organizationTable,
  repoIssueTable,
  repoPullRequestTable,
  repoTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { requireResourcePrivilege } from "../../resource-access";

type SearchParams = {
  query: string;
  userEmail?: string;
  userId?: string;
  type?:
    | "all"
    | "tasks"
    | "boards"
    | "organizations"
    | "comments"
    | "activities"
    | "repositories"
    | "issues"
    | "pullRequests";
  organizationId?: string;
  boardId?: string;
  limit?: number;
};

type SearchResult = {
  id: string;
  type:
    | "task"
    | "board"
    | "organization"
    | "comment"
    | "activity"
    | "repository"
    | "issue"
    | "pull_request";
  title: string;
  description?: string;
  content?: string;
  boardId?: string;
  boardName?: string;
  organizationId?: string;
  organizationName?: string;
  userId?: string;
  userName?: string;
  createdAt: Date;
  relevanceScore: number;
  taskNumber?: number;
  boardSlug?: string;
  priority?: string;
  status?: string;
  repoId?: string;
  repoOwner?: string;
  repoName?: string;
  repoProvider?: string;
  itemNumber?: number;
  state?: string;
  url?: string;
};

function toDisplayCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getActivitySearchContent(
  type: string,
  content: string | null,
  eventData: unknown,
) {
  if (content) return content;
  if (!eventData || typeof eventData !== "object" || Array.isArray(eventData)) {
    return undefined;
  }

  const data = eventData as Record<string, unknown>;

  switch (type) {
    case "status_changed":
      return `changed status from ${toDisplayCase(String(data.oldStatus ?? ""))} to ${toDisplayCase(String(data.newStatus ?? ""))}`;
    case "priority_changed":
      return `changed priority from ${toDisplayCase(String(data.oldPriority ?? ""))} to ${toDisplayCase(String(data.newPriority ?? ""))}`;
    case "unassigned":
      return "unassigned the ticket";
    case "assignee_changed":
      return data.isSelfAssigned
        ? "assigned the ticket to themselves"
        : `assigned the ticket to ${String(data.newAssignee ?? "someone")}`;
    case "due_date_changed":
      if (!data.newDueDate) {
        return "cleared the due date";
      }
      if (!data.oldDueDate) {
        return `set due date to ${String(data.newDueDate)}`;
      }
      return `changed due date from ${String(data.oldDueDate)} to ${String(data.newDueDate)}`;
    case "title_changed":
      return `changed title from "${String(data.oldTitle ?? "")}" to "${String(data.newTitle ?? "")}"`;
    case "task":
      return "created the ticket";
    default:
      return undefined;
  }
}

async function globalSearch(params: SearchParams): Promise<{
  results: SearchResult[];
  totalCount: number;
  searchQuery: string;
}> {
  const {
    query,
    userId,
    userEmail,
    type = "all",
    organizationId,
    boardId,
    limit = 20,
  } = params;

  let resolvedUserId = userId;
  if (!resolvedUserId && userEmail) {
    const user = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, userEmail))
      .limit(1);

    if (user.length > 0 && user[0]) {
      resolvedUserId = user[0].id;
    }
  }

  if (!resolvedUserId) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const userOrganizations = await db
    .select({ organizationId: organizationMemberTable.organizationId })
    .from(organizationMemberTable)
    .where(eq(organizationMemberTable.userId, resolvedUserId));

  const accessibleOrganizationIds = userOrganizations
    .map((w) => w.organizationId)
    .filter(Boolean);

  if (accessibleOrganizationIds.length === 0) {
    return { results: [], totalCount: 0, searchQuery: query };
  }

  const results: SearchResult[] = [];
  const searchPattern = `%${query.toLowerCase()}%`;

  const organizationFilter = organizationId
    ? eq(boardTable.organizationId, organizationId)
    : inArray(boardTable.organizationId, accessibleOrganizationIds);

  const repoOrganizationFilter = organizationId
    ? eq(repoTable.organizationId, organizationId)
    : inArray(repoTable.organizationId, accessibleOrganizationIds);

  // Matches "#12" or a bare number so issue/PR numbers are directly searchable.
  const issueNumberMatch = query.trim().match(/^#?(\d+)$/);
  const searchedNumber = issueNumberMatch?.[1]
    ? Number.parseInt(issueNumberMatch[1], 10)
    : undefined;

  // Check if query matches short-id pattern (e.g. "DEP-23")
  const shortIdMatch = query.match(/^([A-Za-z][\w-]*)-(\d+)$/);

  if (type === "all" || type === "tasks") {
    const seenTaskIds = new Set<string>();

    // If query matches short-id pattern, look up by board slug + task number first
    if (shortIdMatch?.[1] && shortIdMatch[2]) {
      const slug = shortIdMatch[1];
      const numberStr = shortIdMatch[2];
      const taskNumber = Number.parseInt(numberStr, 10);

      const shortIdTasks = await db
        .select({
          id: taskTable.id,
          title: taskTable.title,
          description: taskTable.description,
          boardId: taskTable.boardId,
          boardName: boardTable.name,
          boardSlug: boardTable.slug,
          organizationId: boardTable.organizationId,
          organizationName: organizationTable.name,
          userId: taskTable.userId,
          userName: userTable.name,
          createdAt: taskTable.createdAt,
          taskNumber: taskTable.number,
          priority: taskTable.priority,
          status: taskTable.status,
        })
        .from(taskTable)
        .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
        .leftJoin(
          organizationTable,
          eq(boardTable.organizationId, organizationTable.id),
        )
        .leftJoin(userTable, eq(taskTable.userId, userTable.id))
        .where(
          and(
            organizationFilter,
            boardId ? eq(taskTable.boardId, boardId) : undefined,
            ilike(boardTable.slug, slug),
            eq(taskTable.number, taskNumber),
            isNull(taskTable.deletedAt),
          ),
        )
        .limit(1);

      for (const task of shortIdTasks) {
        seenTaskIds.add(task.id);
        results.push({
          id: task.id,
          type: "task",
          title: task.title,
          description: task.description || undefined,
          boardId: task.boardId,
          boardName: task.boardName || undefined,
          boardSlug: task.boardSlug || undefined,
          organizationId: task.organizationId || undefined,
          organizationName: task.organizationName || undefined,
          userId: task.userId || undefined,
          userName: task.userName || undefined,
          createdAt: task.createdAt,
          relevanceScore: 10, // Highest relevance for exact short-id match
          taskNumber: task.taskNumber || undefined,
          priority: task.priority || undefined,
          status: task.status,
        });
      }
    }

    // Also run text search for tasks. `searchedNumber` is set when the query is
    // a bare number or "#78", which lets users find a task by the number shown
    // in the UI. It stays undefined for non-numeric queries like "abc" so plain
    // text search is unaffected.
    const taskNumberMatch =
      searchedNumber === undefined
        ? undefined
        : eq(taskTable.number, searchedNumber);

    const taskRelevanceScore = sql<number>`
      CASE
        ${taskNumberMatch ? sql`WHEN ${taskTable.number} = ${searchedNumber} THEN 4` : sql``}
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${taskTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const taskQuery = db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        description: taskTable.description,
        boardId: taskTable.boardId,
        boardName: boardTable.name,
        boardSlug: boardTable.slug,
        organizationId: boardTable.organizationId,
        organizationName: organizationTable.name,
        userId: taskTable.userId,
        userName: userTable.name,
        createdAt: taskTable.createdAt,
        taskNumber: taskTable.number,
        priority: taskTable.priority,
        status: taskTable.status,
        relevanceScore: taskRelevanceScore.as("relevanceScore"),
      })
      .from(taskTable)
      .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .leftJoin(
        organizationTable,
        eq(boardTable.organizationId, organizationTable.id),
      )
      .leftJoin(userTable, eq(taskTable.userId, userTable.id))
      .where(
        and(
          organizationFilter,
          boardId ? eq(taskTable.boardId, boardId) : undefined,
          isNull(taskTable.deletedAt),
          or(
            ilike(taskTable.title, searchPattern),
            ilike(taskTable.description, searchPattern),
            taskNumberMatch,
          ),
        ),
      )
      .orderBy(desc(taskRelevanceScore), desc(taskTable.createdAt))
      .limit(limit);

    const tasks = await taskQuery;

    for (const task of tasks) {
      if (seenTaskIds.has(task.id)) continue;
      results.push({
        id: task.id,
        type: "task",
        title: task.title,
        description: task.description || undefined,
        boardId: task.boardId,
        boardName: task.boardName || undefined,
        boardSlug: task.boardSlug || undefined,
        organizationId: task.organizationId || undefined,
        organizationName: task.organizationName || undefined,
        userId: task.userId || undefined,
        userName: task.userName || undefined,
        createdAt: task.createdAt,
        relevanceScore: task.relevanceScore,
        taskNumber: task.taskNumber || undefined,
        priority: task.priority || undefined,
        status: task.status,
      });
    }
  }

  if (type === "all" || type === "boards") {
    const boardRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${boardTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${boardTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const boardQuery = db
      .select({
        id: boardTable.id,
        name: boardTable.name,
        description: boardTable.description,
        slug: boardTable.slug,
        organizationId: boardTable.organizationId,
        organizationName: organizationTable.name,
        createdAt: boardTable.createdAt,
        relevanceScore: boardRelevanceScore.as("relevanceScore"),
      })
      .from(boardTable)
      .leftJoin(
        organizationTable,
        eq(boardTable.organizationId, organizationTable.id),
      )
      .where(
        and(
          organizationFilter,
          or(
            ilike(boardTable.name, searchPattern),
            ilike(boardTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(desc(boardRelevanceScore), desc(boardTable.createdAt))
      .limit(limit);

    const boards = await boardQuery;

    for (const board of boards) {
      results.push({
        id: board.id,
        type: "board",
        title: board.name,
        description: board.description || undefined,
        boardId: board.id,
        boardSlug: board.slug || undefined,
        organizationId: board.organizationId,
        organizationName: board.organizationName || undefined,
        createdAt: board.createdAt,
        relevanceScore: board.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "organizations") {
    const organizationRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${organizationTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${organizationTable.description}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const organizationQuery = db
      .select({
        id: organizationTable.id,
        name: organizationTable.name,
        description: organizationTable.description,
        createdAt: organizationTable.createdAt,
        relevanceScore: organizationRelevanceScore.as("relevanceScore"),
      })
      .from(organizationTable)
      .leftJoin(
        organizationMemberTable,
        eq(organizationTable.id, organizationMemberTable.organizationId),
      )
      .where(
        and(
          inArray(organizationTable.id, accessibleOrganizationIds),
          or(
            ilike(organizationTable.name, searchPattern),
            ilike(organizationTable.description, searchPattern),
          ),
        ),
      )
      .orderBy(
        desc(organizationRelevanceScore),
        desc(organizationTable.createdAt),
      )
      .limit(limit);

    const organizations = await organizationQuery;

    for (const organization of organizations) {
      results.push({
        id: organization.id,
        type: "organization",
        title: organization.name,
        description: organization.description || undefined,
        organizationId: organization.id,
        organizationName: organization.name,
        createdAt: organization.createdAt,
        relevanceScore: organization.relevanceScore,
      });
    }
  }

  if (type === "all" || type === "comments" || type === "activities") {
    const searchableActivityText = sql<string>`COALESCE(${activityTable.content}, CAST(${activityTable.eventData} AS text), '')`;
    const activityRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${searchableActivityText}) LIKE ${searchPattern} THEN 2
        WHEN LOWER(${taskTable.title}) LIKE ${searchPattern} THEN 1
        ELSE 1
      END
    `;

    const activityQuery = db
      .select({
        id: activityTable.id,
        type: activityTable.type,
        content: activityTable.content,
        eventData: activityTable.eventData,
        taskId: activityTable.taskId,
        taskTitle: taskTable.title,
        taskNumber: taskTable.number,
        boardId: boardTable.id,
        boardName: boardTable.name,
        boardSlug: boardTable.slug,
        organizationId: boardTable.organizationId,
        organizationName: organizationTable.name,
        userId: activityTable.userId,
        userName: userTable.name,
        createdAt: activityTable.createdAt,
        relevanceScore: activityRelevanceScore.as("relevanceScore"),
      })
      .from(activityTable)
      .leftJoin(taskTable, eq(activityTable.taskId, taskTable.id))
      .leftJoin(boardTable, eq(taskTable.boardId, boardTable.id))
      .leftJoin(
        organizationTable,
        eq(boardTable.organizationId, organizationTable.id),
      )
      .leftJoin(userTable, eq(activityTable.userId, userTable.id))
      .where(
        and(
          organizationFilter,
          boardId ? eq(taskTable.boardId, boardId) : undefined,
          or(
            ilike(searchableActivityText, searchPattern),
            ilike(taskTable.title, searchPattern),
          ),
          type === "comments" ? eq(activityTable.type, "comment") : undefined,
        ),
      )
      .orderBy(desc(activityRelevanceScore), desc(activityTable.createdAt))
      .limit(limit);

    const activities = await activityQuery;

    for (const activity of activities) {
      const isComment = activity.type === "comment";
      const activityContent = getActivitySearchContent(
        activity.type,
        activity.content,
        activity.eventData,
      );
      results.push({
        id: activity.id,
        type: isComment ? "comment" : "activity",
        title: isComment
          ? `Comment on ${activity.taskTitle || "task"}`
          : `${activity.type} on ${activity.taskTitle || "task"}`,
        content: activityContent,
        boardId: activity.boardId || undefined,
        boardName: activity.boardName || undefined,
        boardSlug: activity.boardSlug || undefined,
        organizationId: activity.organizationId || undefined,
        organizationName: activity.organizationName || undefined,
        userId: activity.userId || undefined,
        userName: activity.userName || undefined,
        createdAt: activity.createdAt,
        relevanceScore: activity.relevanceScore,
        taskNumber: activity.taskNumber || undefined,
      });
    }
  }

  if (type === "all" || type === "repositories") {
    const repoRelevanceScore = sql<number>`
      CASE
        WHEN LOWER(${repoTable.name}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${repoTable.owner}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const repos = await db
      .select({
        id: repoTable.id,
        owner: repoTable.owner,
        name: repoTable.name,
        provider: repoTable.provider,
        description: repoTable.description,
        url: repoTable.url,
        organizationId: repoTable.organizationId,
        organizationName: organizationTable.name,
        createdAt: repoTable.createdAt,
        relevanceScore: repoRelevanceScore.as("relevanceScore"),
      })
      .from(repoTable)
      .leftJoin(
        organizationTable,
        eq(repoTable.organizationId, organizationTable.id),
      )
      .where(
        and(
          repoOrganizationFilter,
          or(
            ilike(repoTable.name, searchPattern),
            ilike(repoTable.owner, searchPattern),
            ilike(repoTable.description, searchPattern),
            ilike(
              sql<string>`${repoTable.owner} || '/' || ${repoTable.name}`,
              searchPattern,
            ),
          ),
        ),
      )
      .orderBy(desc(repoRelevanceScore), desc(repoTable.createdAt))
      .limit(limit);

    for (const repo of repos) {
      results.push({
        id: repo.id,
        type: "repository",
        title: `${repo.owner}/${repo.name}`,
        description: repo.description || undefined,
        organizationId: repo.organizationId,
        organizationName: repo.organizationName || undefined,
        createdAt: repo.createdAt,
        relevanceScore: repo.relevanceScore,
        repoId: repo.id,
        repoOwner: repo.owner,
        repoName: repo.name,
        repoProvider: repo.provider,
        url: repo.url,
      });
    }
  }

  if (type === "all" || type === "issues") {
    const issueRelevanceScore = sql<number>`
      CASE
        WHEN ${searchedNumber === undefined ? sql`FALSE` : sql`${repoIssueTable.number} = ${searchedNumber}`} THEN 4
        WHEN LOWER(${repoIssueTable.title}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${repoIssueTable.body}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const issues = await db
      .select({
        id: repoIssueTable.id,
        number: repoIssueTable.number,
        title: repoIssueTable.title,
        body: repoIssueTable.body,
        state: repoIssueTable.state,
        url: repoIssueTable.url,
        authorLogin: repoIssueTable.authorLogin,
        createdAt: repoIssueTable.createdAt,
        repoId: repoTable.id,
        repoOwner: repoTable.owner,
        repoName: repoTable.name,
        repoProvider: repoTable.provider,
        organizationId: repoTable.organizationId,
        organizationName: organizationTable.name,
        relevanceScore: issueRelevanceScore.as("relevanceScore"),
      })
      .from(repoIssueTable)
      .innerJoin(repoTable, eq(repoIssueTable.repoId, repoTable.id))
      .leftJoin(
        organizationTable,
        eq(repoTable.organizationId, organizationTable.id),
      )
      .where(
        and(
          repoOrganizationFilter,
          or(
            ilike(repoIssueTable.title, searchPattern),
            ilike(repoIssueTable.body, searchPattern),
            searchedNumber === undefined
              ? undefined
              : eq(repoIssueTable.number, searchedNumber),
          ),
        ),
      )
      .orderBy(desc(issueRelevanceScore), desc(repoIssueTable.createdAt))
      .limit(limit);

    for (const issue of issues) {
      results.push({
        id: issue.id,
        type: "issue",
        title: `#${issue.number} ${issue.title}`,
        description: issue.body || undefined,
        organizationId: issue.organizationId,
        organizationName: issue.organizationName || undefined,
        userName: issue.authorLogin || undefined,
        createdAt: issue.createdAt,
        relevanceScore: issue.relevanceScore,
        repoId: issue.repoId,
        repoOwner: issue.repoOwner,
        repoName: issue.repoName,
        repoProvider: issue.repoProvider,
        itemNumber: issue.number,
        state: issue.state,
        url: issue.url,
      });
    }
  }

  if (type === "all" || type === "pullRequests") {
    const pullRequestRelevanceScore = sql<number>`
      CASE
        WHEN ${searchedNumber === undefined ? sql`FALSE` : sql`${repoPullRequestTable.number} = ${searchedNumber}`} THEN 4
        WHEN LOWER(${repoPullRequestTable.title}) LIKE ${searchPattern} THEN 3
        WHEN LOWER(${repoPullRequestTable.body}) LIKE ${searchPattern} THEN 2
        ELSE 1
      END
    `;

    const pullRequests = await db
      .select({
        id: repoPullRequestTable.id,
        number: repoPullRequestTable.number,
        title: repoPullRequestTable.title,
        body: repoPullRequestTable.body,
        state: repoPullRequestTable.state,
        url: repoPullRequestTable.url,
        authorLogin: repoPullRequestTable.authorLogin,
        createdAt: repoPullRequestTable.createdAt,
        repoId: repoTable.id,
        repoOwner: repoTable.owner,
        repoName: repoTable.name,
        repoProvider: repoTable.provider,
        organizationId: repoTable.organizationId,
        organizationName: organizationTable.name,
        relevanceScore: pullRequestRelevanceScore.as("relevanceScore"),
      })
      .from(repoPullRequestTable)
      .innerJoin(repoTable, eq(repoPullRequestTable.repoId, repoTable.id))
      .leftJoin(
        organizationTable,
        eq(repoTable.organizationId, organizationTable.id),
      )
      .where(
        and(
          repoOrganizationFilter,
          or(
            ilike(repoPullRequestTable.title, searchPattern),
            ilike(repoPullRequestTable.body, searchPattern),
            searchedNumber === undefined
              ? undefined
              : eq(repoPullRequestTable.number, searchedNumber),
          ),
        ),
      )
      .orderBy(
        desc(pullRequestRelevanceScore),
        desc(repoPullRequestTable.createdAt),
      )
      .limit(limit);

    for (const pullRequest of pullRequests) {
      results.push({
        id: pullRequest.id,
        type: "pull_request",
        title: `#${pullRequest.number} ${pullRequest.title}`,
        description: pullRequest.body || undefined,
        organizationId: pullRequest.organizationId,
        organizationName: pullRequest.organizationName || undefined,
        userName: pullRequest.authorLogin || undefined,
        createdAt: pullRequest.createdAt,
        relevanceScore: pullRequest.relevanceScore,
        repoId: pullRequest.repoId,
        repoOwner: pullRequest.repoOwner,
        repoName: pullRequest.repoName,
        repoProvider: pullRequest.repoProvider,
        itemNumber: pullRequest.number,
        state: pullRequest.state,
        url: pullRequest.url,
      });
    }
  }

  const privilegeChecks = new Map<string, Promise<boolean>>();
  const visibility = await Promise.all(
    results.map((result) => {
      const resourceType = result.boardId
        ? "board"
        : result.repoId
          ? "repo"
          : null;
      const resourceId = result.boardId ?? result.repoId;
      if (!resourceType || !resourceId || !result.organizationId) {
        return true;
      }

      const key = `${resourceType}:${resourceId}`;
      const existing = privilegeChecks.get(key);
      if (existing) return existing;

      const check = requireResourcePrivilege({
        organizationId: result.organizationId,
        resourceType,
        resourceId,
        userId: resolvedUserId,
        required: "view",
      });
      privilegeChecks.set(key, check);
      return check;
    }),
  );
  const filteredResults = results.filter((_, index) => visibility[index]);

  filteredResults.sort((a, b) => {
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const finalResults = filteredResults.slice(0, limit);

  return {
    results: finalResults,
    totalCount: filteredResults.length,
    searchQuery: query,
  };
}

export default globalSearch;
