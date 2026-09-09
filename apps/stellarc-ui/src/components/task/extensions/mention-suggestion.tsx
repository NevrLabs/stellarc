import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { canOpenReferenceMenu } from "@/lib/editor-reference-query";
import MentionList, {
  type MentionListRef,
  type MentionMember,
} from "./mention-list";

type MentionSuggestionOptions = {
  getMembers: () => MentionMember[];
};

/** How many members the dropdown shows at once. */
export const MENTION_RESULT_LIMIT = 8;

/**
 * Filters organization members for an `@query`.
 *
 * An empty query is the eager-open case: typing `@` alone already lists
 * members instead of waiting for a first search character, mirroring `#`.
 */
export function filterMentionMembers(
  members: MentionMember[],
  query: string,
): MentionMember[] {
  const q = (query ?? "").trim().toLowerCase();
  return (members ?? [])
    .filter((member) => (member?.label ?? "").toLowerCase().includes(q))
    .slice(0, MENTION_RESULT_LIMIT);
}

/**
 * The `@` suggestion configuration, without the tiptap plugin wrapper.
 *
 * Exported so the trigger rules (`allow`, `items`) can be asserted directly —
 * mounting a full tiptap editor in jsdom to prove a guard is not worth it.
 */
export function createMentionSuggestionConfig(
  getMembers: () => MentionMember[],
): Pick<SuggestionOptions, "char" | "allowSpaces" | "allow" | "items"> {
  return {
    char: "@",
    allowSpaces: false,
    // #114 reuses the #103 gate: only a focused, editable editor may open the
    // menu. Hydrating a description that already contains `you@example.com`
    // or a literal `@name` re-runs the matcher on a programmatic setContent,
    // which would otherwise pop the mention dropdown open on load.
    allow: ({ editor }) => canOpenReferenceMenu(editor),
    items: ({ query }) => filterMentionMembers(getMembers(), query),
  };
}

// Adds an @-triggered autocomplete of organization members to an editor. On select
// it inserts a `kaneoMention` node (which round-trips through Markdown). Built on
// @tiptap/suggestion so it stays self-contained and does not touch the editor's
// own keyboard/menu handling.
export const MentionSuggestion = Extension.create<MentionSuggestionOptions>({
  name: "kaneoMentionSuggestion",

  addOptions() {
    return { getMembers: () => [] };
  },

  addProseMirrorPlugins() {
    const getMembers = this.options.getMembers;

    const suggestion: Omit<SuggestionOptions, "editor"> = {
      ...createMentionSuggestionConfig(getMembers),
      pluginKey: new PluginKey("kaneoMentionSuggestion"),
      command: ({ editor, range, props }) => {
        const member = props as unknown as MentionMember;
        editor
          .chain()
          .focus()
          .insertContentAt(range, [
            {
              type: "kaneoMention",
              attrs: { id: member.id, label: member.label },
            },
            { type: "text", text: " " },
          ])
          .run();
      },
      render: () => {
        let component: ReactRenderer<MentionListRef> | null = null;
        let popup: HTMLDivElement | null = null;

        const place = (clientRect?: (() => DOMRect | null) | null) => {
          if (!popup || !clientRect) return;
          const rect = clientRect();
          if (!rect) return;
          popup.style.top = `${rect.bottom + window.scrollY + 4}px`;
          popup.style.left = `${rect.left + window.scrollX}px`;
        };

        return {
          onStart: (props) => {
            component = new ReactRenderer(MentionList, {
              props,
              editor: props.editor,
            });
            popup = document.createElement("div");
            popup.className = "kaneo-mention-popup";
            popup.appendChild(component.element);
            document.body.appendChild(popup);
            place(props.clientRect);
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
            component?.destroy();
            component = null;
          },
        };
      },
    };

    return [Suggestion({ editor: this.editor, ...suggestion })];
  },
});

export default MentionSuggestion;
