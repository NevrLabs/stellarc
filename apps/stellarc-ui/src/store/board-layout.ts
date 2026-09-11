import { create } from "zustand";

type BoardLayoutState = {
  propertiesPanelBoardId: string | null;
  openPropertiesPanel: (boardId: string) => void;
  closePropertiesPanel: () => void;
  togglePropertiesPanel: (boardId: string) => void;
};

export const useBoardLayoutStore = create<BoardLayoutState>((set) => ({
  propertiesPanelBoardId: null,
  openPropertiesPanel: (boardId) => set({ propertiesPanelBoardId: boardId }),
  closePropertiesPanel: () => set({ propertiesPanelBoardId: null }),
  togglePropertiesPanel: (boardId) =>
    set((state) => ({
      propertiesPanelBoardId:
        state.propertiesPanelBoardId === boardId ? null : boardId,
    })),
}));
