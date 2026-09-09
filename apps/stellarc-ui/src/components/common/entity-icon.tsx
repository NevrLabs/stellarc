import { cn } from "@/lib/cn";
import { resolveIcon } from "@/lib/resolve-icon";

/**
 * Renders a board/repo icon value, whether it's a lucide name or an emoji
 * (#171).
 *
 * Emoji are text, not SVG, so they need their own sizing to sit on the same
 * baseline and optical size as the icons beside them. Keeping that in one place
 * stops each call site inventing its own treatment.
 */
export default function EntityIcon({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const resolved = resolveIcon(value);

  if (resolved.kind === "emoji") {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center text-center leading-none",
          className,
        )}
        data-icon-kind="emoji"
      >
        {resolved.emoji}
      </span>
    );
  }

  const { Icon } = resolved;

  return (
    <Icon
      aria-hidden="true"
      className={cn("shrink-0", className)}
      data-icon-kind="lucide"
    />
  );
}
