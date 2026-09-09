import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, CornerDownLeftIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SearchCommandMenu from "@/components/search-command-menu";
import CreateOrganizationModal from "@/components/shared/modals/create-organization-modal";
import CreateTaskModal from "@/components/shared/modals/create-task-modal";
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useBoardSlug } from "@/hooks/use-board-slug";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { openKeyboardShortcutsHelp } from "../keyboard-shortcuts-help";
import CreateBoardModal from "../shared/modals/create-board-modal";

type PaletteActionItem = {
  value: string;
  label: string;
  shortcut?: string;
  onRun: () => void;
};

type PaletteGroup = {
  value: string;
  label: string;
  items: PaletteActionItem[];
};

function CommandPalette() {
  const { t } = useTranslation();
  const { setTheme } = useUserPreferencesStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: organization } = useActiveOrganization();
  const [open, setOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateBoardOpen, setIsCreateBoardOpen] = useState(false);
  const [isCreateOrganizationOpen, setIsCreateOrganizationOpen] =
    useState(false);
  const { boardId: resolvedRouteBoardId } = useBoardSlug();
  const boardIdFromRoute = resolvedRouteBoardId || undefined;
  const isBacklogView = location.pathname.endsWith("/backlog");

  useRegisterShortcuts({
    shortcuts: {
      [shortcuts.help.key]: () => {
        openKeyboardShortcutsHelp();
      },
    },
    modifierShortcuts: {
      [shortcuts.palette.prefix]: {
        [shortcuts.palette.open]: () => {
          setOpen((prev) => !prev);
        },
      },
    },
    sequentialShortcuts: {
      [shortcuts.board.prefix]: {
        [shortcuts.board.list]: () => {
          if (!organization?.id) return;
          navigate({
            to: "/dashboard/organization/$organizationSlug",
            params: { organizationSlug: organization.id },
          });
        },
        [shortcuts.board.create]: () => setIsCreateBoardOpen(true),
      },
      [shortcuts.task.prefix]: {
        [shortcuts.task.create]: () => setIsCreateTaskOpen(true),
      },
      [shortcuts.organization.prefix]: {
        [shortcuts.organization.create]: () => {
          setIsCreateOrganizationOpen(true);
        },
      },
    },
  });

  const runCommand = useCallback((command: () => void) => {
    command();
    setOpen(false);
  }, []);

  const groupedItems = useMemo<PaletteGroup[]>(
    () => [
      {
        value: "suggestions",
        label: t("navigation:commandPalette.suggestions"),
        items: [
          {
            value: "boards",
            label: t("navigation:commandPalette.boards"),
            shortcut: `${shortcuts.board.prefix} ${shortcuts.board.list}`,
            onRun: () => {
              if (!organization?.id) return;
              navigate({
                to: "/dashboard/organization/$organizationSlug",
                params: { organizationSlug: organization.id },
              });
            },
          },
          {
            value: "search",
            label: t("navigation:commandPalette.search"),
            shortcut: shortcuts.search.prefix,
            onRun: () => setIsSearchOpen(true),
          },
          {
            value: "members",
            label: t("navigation:commandPalette.members", {
              defaultValue: "Members",
            }),
            onRun: () => {
              navigate({ to: "/dashboard/settings/organization/members" });
            },
          },
          {
            value: "create-task",
            label: t("navigation:commandPalette.createTask"),
            shortcut: `${shortcuts.task.prefix} ${shortcuts.task.create}`,
            onRun: () => setIsCreateTaskOpen(true),
          },
          {
            value: "create-board",
            label: t("navigation:commandPalette.createBoard"),
            shortcut: `${shortcuts.board.prefix} ${shortcuts.board.create}`,
            onRun: () => setIsCreateBoardOpen(true),
          },
        ],
      },
      {
        value: "commands",
        label: t("navigation:commandPalette.commands"),
        items: [
          {
            value: "create-organization",
            label: t("navigation:commandPalette.createOrganization"),
            shortcut: `${shortcuts.organization.prefix} ${shortcuts.organization.create}`,
            onRun: () => setIsCreateOrganizationOpen(true),
          },
          {
            value: "theme-light",
            label: t("navigation:commandPalette.lightTheme"),
            onRun: () => setTheme("light"),
          },
          {
            value: "theme-dark",
            label: t("navigation:commandPalette.darkTheme"),
            onRun: () => setTheme("dark"),
          },
          {
            value: "theme-system",
            label: t("navigation:commandPalette.systemTheme"),
            onRun: () => setTheme("system"),
          },
          {
            value: "keyboard-shortcuts",
            label: t("navigation:commandPalette.keyboardShortcuts"),
            shortcut: "?",
            onRun: () => {
              setTimeout(() => {
                openKeyboardShortcutsHelp();
              }, 100);
            },
          },
        ],
      },
    ],
    [navigate, setTheme, t, organization?.id],
  );

  const shortcutHandlers = useMemo(() => {
    const handlers = new Map<string, () => void>();
    for (const group of groupedItems) {
      for (const item of group.items) {
        if (!item.shortcut) continue;
        handlers.set(
          item.shortcut.replace(/\s+/g, "").toLowerCase(),
          item.onRun,
        );
      }
    }
    return handlers;
  }, [groupedItems]);

  useEffect(() => {
    if (!open) return;

    let sequence = "";
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key === "Shift"
      ) {
        return;
      }

      if (event.key.length !== 1 && event.key !== "?") {
        return;
      }

      sequence = `${sequence}${event.key.toLowerCase()}`.slice(-3);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        sequence = "";
      }, 700);

      const handler = shortcutHandlers.get(sequence);
      if (!handler) return;

      event.preventDefault();
      runCommand(handler);
      sequence = "";
      clearTimeout(timeout);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, shortcutHandlers, runCommand]);

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandDialogPopup instant>
          <Command items={groupedItems}>
            <CommandInput
              placeholder={t("navigation:commandPalette.inputPlaceholder")}
            />
            <CommandPanel>
              <CommandEmpty>
                {t("navigation:commandPalette.empty")}
              </CommandEmpty>
              <CommandList>
                {(group: PaletteGroup, groupIndex: number) => (
                  <Fragment key={group.value}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.label}</CommandGroupLabel>
                      <CommandCollection>
                        {(item: PaletteActionItem) => {
                          return (
                            <CommandItem
                              key={item.value}
                              value={item.value}
                              onClick={() => runCommand(item.onRun)}
                              className="px-3"
                            >
                              <span className="flex-1">{item.label}</span>
                              {item.shortcut && (
                                <CommandShortcut>
                                  {item.shortcut}
                                </CommandShortcut>
                              )}
                            </CommandItem>
                          );
                        }}
                      </CommandCollection>
                    </CommandGroup>
                    {groupIndex < groupedItems.length - 1 && (
                      <CommandSeparator />
                    )}
                  </Fragment>
                )}
              </CommandList>
            </CommandPanel>
            <CommandFooter>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <KbdGroup>
                    <Kbd>
                      <ArrowUpIcon />
                    </Kbd>
                    <Kbd>
                      <ArrowDownIcon />
                    </Kbd>
                  </KbdGroup>
                  <span>{t("navigation:commandPalette.footer.navigate")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Kbd>
                    <CornerDownLeftIcon />
                  </Kbd>
                  <span>{t("navigation:commandPalette.footer.open")}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Esc</Kbd>
                <span>{t("navigation:commandPalette.footer.close")}</span>
              </div>
            </CommandFooter>
          </Command>
        </CommandDialogPopup>
      </CommandDialog>

      <SearchCommandMenu open={isSearchOpen} setOpen={setIsSearchOpen} />
      <CreateTaskModal
        open={isCreateTaskOpen}
        boardId={boardIdFromRoute}
        status={isBacklogView ? "planned" : undefined}
        onClose={() => setIsCreateTaskOpen(false)}
      />
      <CreateOrganizationModal
        open={isCreateOrganizationOpen}
        onClose={() => setIsCreateOrganizationOpen(false)}
      />
      <CreateBoardModal
        open={isCreateBoardOpen}
        onClose={() => setIsCreateBoardOpen(false)}
      />
    </>
  );
}

export default CommandPalette;
