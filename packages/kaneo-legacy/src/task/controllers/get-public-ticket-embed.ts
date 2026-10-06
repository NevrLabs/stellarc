import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";

export default async function getPublicTicketEmbed(taskId: string) {
  const task = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
    with: {
      board: {
        with: {
          organization: true,
        },
      },
    },
  });

  // This endpoint is deliberately unauthenticated. Treat a private-board ticket
  // exactly like a missing ticket so its existence is not disclosed.
  if (!task || task.board.isPublic !== true) {
    throw new HTTPException(404, { message: "Ticket not found" });
  }

  return {
    ticketKey: `${task.board.slug.toUpperCase()}-${task.number}`,
    title: task.title,
    organizationName: task.board.organization.name,
  };
}
