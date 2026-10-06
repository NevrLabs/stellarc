import db from "../../database";
import { boardTable, columnTable } from "../../database/schema";

export const DEFAULT_PROJECT_COLUMNS = [
  { name: "To Do", slug: "to-do", position: 0, isFinal: false },
  { name: "In Progress", slug: "in-progress", position: 1, isFinal: false },
  { name: "In Review", slug: "in-review", position: 2, isFinal: false },
  { name: "Done", slug: "done", position: 3, isFinal: true },
] as const;

async function createBoard(
  organizationId: string,
  name: string,
  icon: string,
  slug: string,
) {
  return db.transaction(async (tx) => {
    /*
      No `position` here on purpose. Upstream's reordering commit (207504dc)
      added `position: maxPosition === null ? 0 : maxPosition + 1` plus a `max`
      import, but never the query defining `maxPosition` — so every board
      insert threw "maxPosition is not defined".

      The rest of that feature never landed in this fork: boardTable has no
      `position` field, no migration adds the column, and there is no board
      reorder endpoint. Sidebar order is reconciled client-side in
      reconcileSidebarOrder instead. Writing a column that does not exist would
      just move the 500 from JS to SQL.
    */
    const [createdBoard] = await tx
      .insert(boardTable)
      .values({
        organizationId,
        name,
        icon,
        slug,
      })
      .returning();

    if (createdBoard) {
      for (const col of DEFAULT_PROJECT_COLUMNS) {
        await tx.insert(columnTable).values({
          boardId: createdBoard.id,
          name: col.name,
          slug: col.slug,
          position: col.position,
          isFinal: col.isFinal,
        });
      }
    }

    return createdBoard;
  });
}

export default createBoard;
