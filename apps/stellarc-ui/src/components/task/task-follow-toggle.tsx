import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useSetTaskFollowing from "@/hooks/mutations/task/use-set-task-following";
import useGetTaskFollowing from "@/hooks/queries/task/use-get-task-following";
import { cn } from "@/lib/cn";

type TaskFollowToggleProps = {
  taskId: string | undefined;
  className?: string;
};

/**
 * KFL-339: subscribe yourself to a ticket's notifications.
 *
 * Lives in the ACTION BUTTON GROUP next to copy-link and copy-branch, so it is
 * an icon-only segmented `outline` button rather than a labelled property pill.
 *
 * State reads at a glance without a text label:
 *   following      -> FILLED bell (fill="currentColor")
 *   not following  -> hollow bell with a diagonal slash (BellOff)
 * The two lucide glyphs share an outline, so the fill is what distinguishes
 * them — hence the explicit `fill` attribute rather than a colour change alone.
 *
 * Deliberately NOT gated on edit permission: the endpoint is gated on READ
 * because following is a personal subscription, so a read-only member must be
 * able to follow too.
 */
export default function TaskFollowToggle({
  taskId,
  className,
}: TaskFollowToggleProps) {
  const { t } = useTranslation();
  const { data } = useGetTaskFollowing(taskId ?? "");
  const { mutate: setFollowing, isPending } = useSetTaskFollowing();

  if (!taskId) {
    return null;
  }

  const following = Boolean(data?.following);
  const label = following
    ? t("tasks:properties.following")
    : t("tasks:properties.follow");

  return (
    <Button
      aria-label={label}
      aria-pressed={following}
      className={cn("text-foreground", className)}
      data-testid="task-follow-toggle"
      disabled={isPending}
      onClick={() => setFollowing({ taskId, following: !following })}
      size="sm"
      title={label}
      type="button"
      variant="outline"
    >
      {following ? (
        <Bell
          className="size-4"
          data-follow-state="following"
          fill="currentColor"
        />
      ) : (
        <BellOff
          className="size-4"
          data-follow-state="not-following"
          fill="none"
        />
      )}
    </Button>
  );
}
