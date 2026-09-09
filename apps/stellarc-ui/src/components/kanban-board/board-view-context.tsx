import { createContext, type ReactNode, useContext } from "react";
import type { BoardGroupBy } from "@/hooks/use-task-filters-with-labels-support";

/**
 * Board view preferences that deeply-nested card renderers need without
 * threading props through every column/dropzone layer.
 *
 * Defaults to "none" so a board rendered outside the provider (tests, storybook,
 * embedded views) behaves exactly like an ungrouped board rather than crashing.
 */
const BoardGroupByContext = createContext<BoardGroupBy>("none");

export function BoardGroupByProvider({
  groupBy,
  children,
}: {
  groupBy: BoardGroupBy;
  children: ReactNode;
}) {
  return (
    <BoardGroupByContext.Provider value={groupBy}>
      {children}
    </BoardGroupByContext.Provider>
  );
}

export function useBoardGroupBy(): BoardGroupBy {
  return useContext(BoardGroupByContext);
}
