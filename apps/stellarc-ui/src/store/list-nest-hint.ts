import { create } from "zustand";

/**
 * Bridge for List view's "Ctrl + drag to nest" hint.
 *
 * The hint now renders in BoardToolbar (beside the search field) but its state —
 * whether the modifier is held, and what the current drop target would do —
 * lives inside ListView's drag handlers, which mount *below* the toolbar. Rather
 * than lift the whole DnD context into the route, ListView publishes the hint
 * state here and the toolbar subscribes.
 *
 * Cleared on unmount so the hint never lingers after leaving List view.
 */
export type NestPreview = {
  valid: boolean;
  targetId: string | null;
  targetTitle: string;
  reason?: string;
};

type ListNestHintState = {
  /** True while the nest modifier is held during an active drag. */
  armed: boolean;
  preview: NestPreview | null;
  /** List view is mounted and the hint should be shown at all. */
  active: boolean;
  setArmed: (armed: boolean) => void;
  setPreview: (preview: NestPreview | null) => void;
  setActive: (active: boolean) => void;
};

const useListNestHintStore = create<ListNestHintState>((set) => ({
  armed: false,
  preview: null,
  active: false,
  setArmed: (armed) => set({ armed }),
  setPreview: (preview) => set({ preview }),
  setActive: (active) =>
    set(active ? { active } : { active, armed: false, preview: null }),
}));

export default useListNestHintStore;
