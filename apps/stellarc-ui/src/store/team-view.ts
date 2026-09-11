import { create } from "zustand";
import { persist } from "zustand/middleware";

type TeamViewState = {
  /**
   * #96: which team the sidebar is scoped to. `null` means "All" — no team
   * filter at all, which is the default view.
   */
  teamId: string | null;
  teamName: string | null;
  setTeamView: (teamId: string | null, teamName: string | null) => void;
};

export const useTeamViewStore = create<TeamViewState>()(
  persist(
    (set) => ({
      teamId: null,
      teamName: null,
      setTeamView: (teamId: string | null, teamName: string | null) =>
        set({ teamId, teamName }),
    }),
    { name: "kaneo-team-view" },
  ),
);

export default useTeamViewStore;
