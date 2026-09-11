import { create } from "zustand";

type NavigationState = {
  /**
   * Board the user just clicked, before React has committed that route.
   *
   * Board switches are triggered from two places that don't share a component
   * tree: the sidebar board list and the header breadcrumb. Both take multiple
   * seconds on a large board, during which the outgoing route is still mounted —
   * so without a shared signal the previous board's cards sit under the new
   * board's name and the click looks ignored.
   */
  pendingBoardId: string | null;
  setPendingBoardId: (boardId: string | null) => void;
};

export const useNavigationStore = create<NavigationState>((set) => ({
  pendingBoardId: null,
  setPendingBoardId: (boardId) => set({ pendingBoardId: boardId }),
}));
