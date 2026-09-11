import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TaskFlag } from "@/fetchers/flag/get-task-flags";

type FlagBadgeProps = {
  flag: Pick<
    TaskFlag,
    "flagTypeName" | "flagTypeColor" | "targetUserName" | "targetTeamName"
  >;
};

/**
 * Shows the active flag on a task. The flag type's own colour drives the chip
 * so "Blocked" stays visually distinct from "Need Input" on the board.
 */
export function FlagBadge({ flag }: FlagBadgeProps) {
  const { t } = useTranslation();
  const color = flag.flagTypeColor ?? "#ef4444";
  const target = flag.targetUserName ?? flag.targetTeamName;

  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{
        color,
        borderColor: color,
        borderWidth: 1,
        borderStyle: "solid",
      }}
      title={
        target
          ? t("flags:badge.targeted", { target })
          : (flag.flagTypeName ?? "")
      }
    >
      <Flag className="w-2.5 h-2.5" style={{ color }} />
      {flag.flagTypeName}
    </span>
  );
}

export default FlagBadge;
