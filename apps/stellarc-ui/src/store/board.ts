import { create } from "zustand";
import type { BoardWithTasks } from "@/types/board";

const useBoardStore = create<{
  board: BoardWithTasks | undefined;
  setBoard: (updatedBoard: BoardWithTasks | undefined) => void;
}>((set) => ({
  board: undefined,
  setBoard: (updatedBoard) => set(() => ({ board: updatedBoard })),
}));

export default useBoardStore;
