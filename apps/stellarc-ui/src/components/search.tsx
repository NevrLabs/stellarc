"use client";

import { useLocation } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";
import { lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchCommandMenu from "@/components/search-command-menu";
import { SidebarGroup, useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import { useBoardSlug } from "@/hooks/use-board-slug";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";

/**
 * Lazy by design (KFL-86): this component is part of the layout rendered on
 * every route, and a static import here dragged the whole create-task modal
 * tree (~23 KB min) into the entry chunk. Every other consumer loads it on
 * demand; the sidebar does too now.
 */
const CreateTaskModal = lazy(
  () => import("@/components/shared/modals/create-task-modal"),
);

export default function Search() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const { state } = useSidebar();
  const location = useLocation();
  const isCollapsed = state === "collapsed";
  const { boardId } = useBoardSlug();
  const isBacklog = location.pathname.endsWith("/backlog");

  useRegisterShortcuts({
    shortcuts: {
      [shortcuts.search.prefix]: () => {
        setOpen(true);
      },
    },
  });

  /*
   * #96: collapsed, the search field morphs into a single icon button with a
   * hover tooltip — the bordered input plus its shortcut hint looked clipped
   * and unfinished in a 64px rail.
   */
  if (isCollapsed) {
    return (
      <SidebarGroup className="pb-1">
        <TooltipProvider>
          <div className="flex flex-col gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    aria-label={t("navigation:commandPalette.search")}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                    data-testid="sidebar-search-collapsed"
                    onClick={() => setOpen(true)}
                    type="button"
                  >
                    <SearchIcon aria-hidden="true" size={16} />
                  </button>
                }
              />
              <TooltipContent side="right">
                {t("navigation:commandPalette.search")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    aria-label={t("navigation:commandPalette.createTask")}
                    className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                    onClick={() => setCreateOpen(true)}
                    type="button"
                  >
                    <PlusIcon aria-hidden="true" size={16} />
                  </button>
                }
              />
              <TooltipContent side="right">
                {t("navigation:commandPalette.createTask")}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <SearchCommandMenu open={open} setOpen={setOpen} />
        <CreateTaskModal
          boardId={boardId}
          onClose={() => setCreateOpen(false)}
          open={createOpen}
          status={isBacklog ? "planned" : undefined}
        />
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="pb-1">
      <div className="flex gap-1">
        <button
          className="inline-flex h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 py-1.5 text-foreground text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => setOpen(true)}
          type="button"
        >
          <span className="flex grow items-center">
            <SearchIcon
              aria-hidden="true"
              className="-ms-1 me-3 text-muted-foreground/80"
              size={16}
            />
            <span className="font-normal text-muted-foreground/70">
              {t("navigation:commandPalette.search")}
            </span>
          </span>
          <kbd className="-me-0.5 ms-6 inline-flex h-4 max-h-full items-center rounded border border-border/70 bg-background px-1 font-[inherit] font-medium text-[0.625rem] text-muted-foreground/60">
            {shortcuts.search.prefix}
          </kbd>
        </button>
        <button
          aria-label={t("navigation:commandPalette.createTask")}
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background text-muted-foreground shadow-xs transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          <PlusIcon aria-hidden="true" size={16} />
        </button>
      </div>

      <SearchCommandMenu open={open} setOpen={setOpen} />
      <CreateTaskModal
        boardId={boardId}
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        status={isBacklog ? "planned" : undefined}
      />
    </SidebarGroup>
  );
}
