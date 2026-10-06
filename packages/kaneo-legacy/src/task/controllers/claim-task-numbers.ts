import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { boardTable, taskTable } from "../../database/schema";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reserves `count` consecutive task numbers on a board.
 *
 * #127: the board's `lastTaskNumber` is a counter, but `task.number` is also
 * protected by a `(board_id, number)` unique constraint. If any path ever
 * writes a task number without advancing the counter — a restore, an import
 * that failed midway, a direct insert — the counter falls behind the real
 * maximum and the next create hands out a number that already exists. The
 * insert then dies on the unique constraint and the request 500s, permanently,
 * for that board: every retry claims the same colliding number.
 *
 * That is exactly what happened to one board (counter 12, max task number 13).
 * So the claim is written to be self-healing: it advances the counter to at
 * least the board's real maximum before reserving, in a single statement so
 * concurrent claims still serialise on the row lock.
 */
async function claimTaskNumbers(
  boardId: string,
  count: number,
  dbOrTx: DbOrTx = db,
) {
  // GREATEST(counter, COALESCE(max(number), 0)) + count, evaluated atomically
  // against the row being updated, so a drifted counter self-corrects instead
  // of colliding forever.
  const [updated] = await dbOrTx
    .update(boardTable)
    .set({
      lastTaskNumber: sql`GREATEST(
        ${boardTable.lastTaskNumber},
        COALESCE(
          (SELECT MAX(${taskTable.number}) FROM ${taskTable}
            WHERE ${taskTable.boardId} = ${boardTable.id}),
          0
        )
      ) + ${count}`,
    })
    .where(eq(boardTable.id, boardId))
    .returning({ lastTaskNumber: boardTable.lastTaskNumber });

  if (!updated) {
    throw new HTTPException(404, {
      message: "Board not found",
    });
  }

  return updated.lastTaskNumber - count + 1;
}

export async function claimTaskNumber(boardId: string, dbOrTx: DbOrTx = db) {
  return claimTaskNumbers(boardId, 1, dbOrTx);
}

export default claimTaskNumbers;
