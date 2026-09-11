import type { TaskFlag } from "@/fetchers/flag/get-task-flags";
import FlagBadge from "./flag-badge";

type TaskFlagBadgesProps = {
  flags?: TaskFlag[];
};

/**
 * Board-card surface: renders only ACTIVE flags (the API already filters
 * resolved ones out unless includeResolved is asked for).
 */
export function TaskFlagBadges({ flags = [] }: TaskFlagBadgesProps) {
  const activeFlags = flags.filter((flag) => !flag.resolvedAt);

  if (activeFlags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {activeFlags.map((flag) => (
        <FlagBadge key={flag.id} flag={flag} />
      ))}
    </div>
  );
}

export default TaskFlagBadges;
