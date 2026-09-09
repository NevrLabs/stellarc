import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Persisted drafts for in-progress comments, keyed by task.
 *
 * Mirrors the "New Task" draft store (`@/store/task-draft`): same zustand +
 * persist(localStorage) shape, so an unsent comment survives navigating away
 * from the task, a reload, or an accidental drawer close. Kept as its own store
 * because comments are keyed by task id and hold nothing but markdown — sharing
 * `TaskDraft` would mean carrying six unused fields per comment.
 */
export type CommentDraft = {
  content: string;
  savedAt: number;
};

type CommentDraftStore = {
  drafts: Record<string, CommentDraft>;
  saveDraft: (key: string, content: string) => void;
  getDraft: (key: string) => CommentDraft | undefined;
  clearDraft: (key: string) => void;
};

/** Draft key for the "new comment" composer of a task. */
export function commentDraftKey(taskId: string | undefined | null) {
  return `comment:${taskId || "no-task"}`;
}

/** Whitespace-only markdown is not worth restoring, and must not be persisted. */
export function isPersistableCommentDraft(content: string) {
  return content.replace(/<[^>]*>/g, "").trim().length > 0;
}

export const useCommentDraftStore = create<CommentDraftStore>()(
  persist(
    (set, get) => ({
      drafts: {},
      saveDraft: (key, content) =>
        set((state) => {
          if (!isPersistableCommentDraft(content)) {
            if (!(key in state.drafts)) return state;
            const cleared = { ...state.drafts };
            delete cleared[key];
            return { drafts: cleared };
          }
          return {
            drafts: {
              ...state.drafts,
              [key]: { content, savedAt: Date.now() },
            },
          };
        }),
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
      name: "comment-drafts",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export default useCommentDraftStore;
