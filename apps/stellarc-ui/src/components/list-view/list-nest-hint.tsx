import { CornerDownRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import useListNestHintStore from "@/store/list-nest-hint";

/**
 * "Ctrl + drag to nest" hint for List view, rendered beside the toolbar search
 * field. It used to sit in a second toolbar row under the main one, which
 * duplicated the bar for a single hint plus Bulk Actions.
 *
 * Reads live drag state from `list-nest-hint` because the drag handlers live in
 * ListView, below this toolbar. Renders nothing outside List view.
 */
function ListNestHint() {
  const { t } = useTranslation();
  const active = useListNestHintStore((state) => state.active);
  const armed = useListNestHintStore((state) => state.armed);
  const preview = useListNestHintStore((state) => state.preview);

  if (!active) return null;

  return (
    <TooltipProvider delay={100} closeDelay={0}>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "inline-flex max-w-[20rem] items-center gap-1.5 rounded border border-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors",
                armed && "border-ring/40 bg-accent/60 text-foreground",
                preview?.valid &&
                  "border-primary/60 bg-primary/10 text-primary",
                preview &&
                  !preview.valid &&
                  "border-destructive/50 bg-destructive/10 text-destructive",
              )}
              data-testid="list-nest-hint"
            />
          }
        >
          <CornerDownRight className="size-3 shrink-0" />
          <span className="truncate" data-testid="list-nest-preview">
            {preview
              ? preview.valid
                ? t("tasks:nest.willNestUnder", { title: preview.targetTitle })
                : t("tasks:nest.cannotNestHere")
              : t("tasks:nest.hint")}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {preview
            ? preview.valid
              ? t("tasks:nest.releaseToNest", { title: preview.targetTitle })
              : t("tasks:nest.cannotNestReason")
            : t("tasks:nest.tooltip")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default ListNestHint;
