import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Snapshot of an unsubmitted "New Task" form.
 *
 * `draftTask` is the server-side placeholder the modal creates so images can be
 * uploaded before the task exists. Preserving it is the whole point: dropping it
 * would orphan every uploaded image, so a resumed draft reuses the same task
 * instead of creating a second one.
 */
export type TaskDraft = {
  title: string;
  description: string;
  priority: string;
  assigneeId: string;
  startDate: string | null;
  dueDate: string | null;
  labels: unknown[];
  draftTask: unknown | null;
  savedAt: number;
};

type TaskDraftStore = {
  drafts: Record<string, TaskDraft>;
  saveDraft: (key: string, draft: TaskDraft) => void;
  getDraft: (key: string) => TaskDraft | undefined;
  clearDraft: (key: string) => void;
};

export const useTaskDraftStore = create<TaskDraftStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      saveDraft: (key, draft) =>
        set((state) => ({ drafts: { ...state.drafts, [key]: draft } })),
      getDraft: (key) => get().drafts[key],
      clearDraft: (key) =>
        set((state) => {
          if (!(key in state.drafts)) return state;
          const next = { ...state.drafts };
          delete next[key];
          return { drafts: next };
        }),
    }),
    {
      name: "task-drafts",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useTaskDraftStore;
