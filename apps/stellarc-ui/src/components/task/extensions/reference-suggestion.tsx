import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { shouldRepositionOverlay } from "@/lib/editor-overlay-position";
import {
  canOpenReferenceMenu,
  shouldShowReferenceMenu,
} from "@/lib/editor-reference-query";
import ReferenceList, {
  type ReferenceItem,
  type ReferenceListRef,
} from "./reference-list";

type ReferenceSuggestionOptions = {
  /**
   * Resolves `#query` to referenceable items. Async because tasks, issues and
   * pull requests are searched server-side rather than held in memory.
   */
  search: (query: string) => Promise<ReferenceItem[]>;
};

/**
 * Adds a `#`-triggered autocomplete for Kaneo tasks and GitHub issues / pull
 * requests.
 *
 * `@` is already taken by member mentions, so `#` follows the convention users
 * know from GitHub. Selecting an item inserts a `kaneoIssueLink` node — the same
 * node the editor already renders with a hover preview — so references get rich
 * rendering and Markdown round-tripping for free instead of a second node type.
 */
export const ReferenceSuggestion = Extension.create<ReferenceSuggestionOptions>(
  {
    name: "kaneoReferenceSuggestion",

    addOptions() {
      return { search: async () => [] };
    },

    addProseMirrorPlugins() {
      const search = this.options.search;

      const suggestion: Omit<SuggestionOptions, "editor"> = {
        char: "#",
        pluginKey: new PluginKey("kaneoReferenceSuggestion"),
        allowSpaces: false,
        // #103: only a focused, editable editor may open the menu. Without
        // this, hydrating a task whose description contains `#3` popped the
        // reference dropdown open over the drawer on load.
        allow: ({ editor }) => canOpenReferenceMenu(editor),
        // An empty query is a valid state: typing `#` alone must already list
        // referenceable tasks instead of waiting for a first search character.
        items: ({ query }) =>
          shouldShowReferenceMenu(query) ? search(query) : Promise.resolve([]),
        command: ({ editor, range, props }) => {
          const item = props as unknown as ReferenceItem;
          const issueKey =
            item.number === null ? item.scope : `${item.scope}#${item.number}`;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: "kaneoIssueLink",
                attrs: {
                  issueKey,
                  url: item.url,
                  taskId: item.kind === "task" ? item.id : "",
                },
              },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => {
          let component: ReactRenderer<ReferenceListRef> | null = null;
          let popup: HTMLDivElement | null = null;
          // Last position actually written to the popup. Opening the popup
          // reflows the task drawer, which nudges the caret rect, which would
          // move the popup again — a feedback loop the user sees as jitter.
          // Only meaningful caret movement is allowed to reposition it.
          let placedAt: { top: number; left: number } | null = null;

          const place = (
            clientRect?: (() => DOMRect | null) | null,
            force = false,
          ) => {
            if (!popup || !clientRect) return;
            const rect = clientRect();
            if (!rect) return;
            const next = {
              top: rect.bottom + window.scrollY + 4,
              left: rect.left + window.scrollX,
            };
            if (!force && !shouldRepositionOverlay(placedAt, next)) return;
            placedAt = next;
            popup.style.top = `${next.top}px`;
            popup.style.left = `${next.left}px`;
          };

          return {
            onStart: (props) => {
              component = new ReactRenderer(ReferenceList, {
                props,
                editor: props.editor,
              });
              popup = document.createElement("div");
              popup.className = "kaneo-mention-popup";
              popup.appendChild(component.element);
              document.body.appendChild(popup);
              placedAt = null;
              place(props.clientRect, true);
            },
            onUpdate: (props) => {
              component?.updateProps(props);
              place(props.clientRect);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") return false;
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              popup?.remove();
              popup = null;
              placedAt = null;
              component?.destroy();
              component = null;
            },
          };
        },
      };

      return [Suggestion({ editor: this.editor, ...suggestion })];
    },
  },
);

export default ReferenceSuggestion;
