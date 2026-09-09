import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KbdSequence } from "@/components/ui/kbd";
import { shortcuts } from "@/constants/shortcuts";

type ShortcutItem = {
  keys: string[];
  description: string;
  icon?: React.ReactNode;
};

type ShortcutCategory = {
  title: string;
  shortcuts: ShortcutItem[];
};

/** Exported so the documented inventory can be asserted directly (#115). */
export function useShortcutCategories(): ShortcutCategory[] {
  const { t } = useTranslation();

  return useMemo(
    () => [
      {
        title: t("navigation:keyboardShortcuts.categories.general"),
        shortcuts: [
          {
            keys: [shortcuts.palette.prefix, shortcuts.palette.open],
            description: t(
              "navigation:keyboardShortcuts.items.openCommandPalette",
            ),
          },
          {
            keys: [shortcuts.search.prefix],
            description: t("navigation:keyboardShortcuts.items.globalSearch"),
          },
          {
            keys: [shortcuts.sidebar.prefix, shortcuts.sidebar.toggle],
            description: t("navigation:keyboardShortcuts.items.toggleSidebar"),
          },
          {
            keys: ["?"],
            description: t("navigation:keyboardShortcuts.items.showShortcuts"),
          },
          {
            keys: ["Escape"],
            description: t("navigation:keyboardShortcuts.items.closeModal"),
          },
        ],
      },
      {
        title: t("navigation:keyboardShortcuts.categories.create"),
        shortcuts: [
          {
            keys: [shortcuts.task.prefix, shortcuts.task.create],
            description: t("navigation:keyboardShortcuts.items.createTask"),
          },
          {
            keys: [shortcuts.task.focusTitle],
            description: "Focus task title (when creating a task)",
          },
          {
            keys: [shortcuts.board.prefix, shortcuts.board.create],
            description: t("navigation:keyboardShortcuts.items.createBoard"),
          },
          {
            keys: [
              shortcuts.organization.prefix,
              shortcuts.organization.create,
            ],
            description: t(
              "navigation:keyboardShortcuts.items.createOrganization",
            ),
          },
        ],
      },
      {
        title: t("navigation:keyboardShortcuts.categories.views"),
        shortcuts: [
          {
            keys: [shortcuts.view.prefix, shortcuts.view.board],
            description: t("navigation:keyboardShortcuts.items.boardView"),
          },
          {
            keys: [shortcuts.view.prefix, shortcuts.view.list],
            description: t("navigation:keyboardShortcuts.items.listView"),
          },
          {
            keys: [shortcuts.view.prefix, shortcuts.view.backlog],
            description: t("navigation:keyboardShortcuts.items.backlogView"),
          },
        ],
      },
      {
        title: t("navigation:keyboardShortcuts.categories.navigation"),
        shortcuts: [
          {
            keys: ["j"],
            description: t("navigation:keyboardShortcuts.items.nextTask"),
          },
          {
            keys: ["k"],
            description: t("navigation:keyboardShortcuts.items.prevTask"),
          },
          {
            keys: ["Enter"],
            description: t("navigation:keyboardShortcuts.items.openTask"),
          },
        ],
      },
      {
        title: t("navigation:keyboardShortcuts.categories.quickSelect"),
        shortcuts: [
          {
            keys: ["1", "2", "3", "..."],
            description: t(
              "navigation:keyboardShortcuts.items.quickSelectNumber",
            ),
          },
        ],
      },
      /*
       * #115: "A help popup to show all the shortcuts in Task title, Task
       * description, comments. @ / # etc."
       *
       * Only shortcuts verified in the code are listed:
       *   #/@/! -> lib/title-token-autocomplete.ts (SIGILS)
       *   @     -> task/extensions/mention-suggestion.tsx (description)
       *   @     -> activity/comment-editor.tsx (comments)
       *   /     -> task-description.tsx slash menu
       */
      {
        title: t("navigation:keyboardShortcuts.categories.ticketTitle"),
        shortcuts: [
          {
            keys: ["#"],
            description: t("navigation:keyboardShortcuts.items.titleLabel"),
          },
          {
            keys: ["@"],
            description: t("navigation:keyboardShortcuts.items.titleMember"),
          },
          {
            keys: ["!"],
            description: t("navigation:keyboardShortcuts.items.titlePriority"),
          },
        ],
      },
      {
        title: t("navigation:keyboardShortcuts.categories.editor"),
        shortcuts: [
          /*
           * #156: `@` and `#` are DIFFERENT pickers and the earlier wording
           * conflated them.
           *   @ -> members (users and agents), extensions/mention-suggestion
           *   # -> tickets,                    extensions/reference-suggestion
           */
          {
            keys: ["@"],
            description: t("navigation:keyboardShortcuts.items.editorMention"),
          },
          {
            keys: ["#"],
            description: t("navigation:keyboardShortcuts.items.editorTicket"),
          },
          {
            keys: ["/"],
            description: t("navigation:keyboardShortcuts.items.editorSlash"),
          },
        ],
      },
    ],
    [t],
  );
}

const KEYBOARD_SHORTCUTS_HELP_EVENT = "kaneo:open-keyboard-shortcuts-help";

/**
 * Opens the keyboard shortcuts help dialog.
 *
 * Callers must NOT fake this by dispatching a synthetic `keydown` on
 * `document`: such an event has a non-Element target, which breaks every
 * document/window-level handler that narrows `event.target` to an Element,
 * and it re-enters the "?" shortcut handler (infinite recursion).
 */
export function openKeyboardShortcutsHelp() {
  window.dispatchEvent(new CustomEvent(KEYBOARD_SHORTCUTS_HELP_EVENT));
}

export function KeyboardShortcutsHelp() {
  const { t } = useTranslation();
  const shortcutCategories = useShortcutCategories();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "?" && !isTyping) {
        e.preventDefault();
        setOpen(true);
      }
    };

    const handleOpenRequest = () => setOpen(true);

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener(KEYBOARD_SHORTCUTS_HELP_EVENT, handleOpenRequest);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(
        KEYBOARD_SHORTCUTS_HELP_EVENT,
        handleOpenRequest,
      );
    };
  }, []);

  const filteredCategories = shortcutCategories
    .map((category) => ({
      ...category,
      shortcuts: category.shortcuts.filter(
        (shortcut) =>
          shortcut.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          shortcut.keys.some((key) =>
            key.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      ),
    }))
    .filter((category) => category.shortcuts.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="px-4 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("navigation:keyboardShortcuts.title")}</DialogTitle>
          <DialogDescription>
            {t("navigation:keyboardShortcuts.subtitle")}
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder={t("navigation:keyboardShortcuts.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-4"
        />

        <div className="overflow-y-auto flex-1">
          <div className="space-y-4">
            {filteredCategories.map((category) => (
              <div key={category.title}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {category.title}
                </h3>
                <div className="space-y-1">
                  {category.shortcuts.map((shortcut) => (
                    <div
                      key={`${category.title}-${shortcut.description}-${shortcut.keys.join("+")}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50"
                    >
                      <span className="text-xs">{shortcut.description}</span>
                      <KbdSequence keys={shortcut.keys} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground mb-4">
          <Trans
            i18nKey="navigation:keyboardShortcuts.footer"
            components={{
              kbd: <kbd className="px-1.5 py-0.5 rounded bg-muted" />,
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
