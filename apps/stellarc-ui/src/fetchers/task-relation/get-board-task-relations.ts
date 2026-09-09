import { client } from "@kaneo/libs";

async function getBoardTaskRelations(boardId: string) {
  const response = await client["task-relation"].board[":boardId"].$get({
    param: { boardId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{
    relations: {
      id: string;
      sourceTaskId: string;
      targetTaskId: string;
      relationType: string;
    }[];
    foreignTasks: {
      id: string;
      title: string;
      number: number | null;
      status: string;
      priority: string | null;
      startDate: string | null;
      dueDate: string | null;
      boardId: string;
      boardName: string;
      boardSlug: string;
    }[];
  }>;
}

export default getBoardTaskRelations;
