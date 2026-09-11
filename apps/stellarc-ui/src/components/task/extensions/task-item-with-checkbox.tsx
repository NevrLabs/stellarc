import TaskItem from "@tiptap/extension-task-item";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { i18n } from "@/lib/i18n";

type CheckboxIslandProps = {
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
};

function TaskItemCheckbox({
  checked,
  disabled,
  onToggle,
}: CheckboxIslandProps) {
  const { t } = useTranslation();
  return (
    <Checkbox
      checked={checked}
      disabled={disabled}
      aria-label={
        checked
          ? t("tasks:detail.editor.checkbox.markIncomplete")
          : t("tasks:detail.editor.checkbox.markComplete")
      }
      onCheckedChange={(value) => onToggle(value === true)}
    />
  );
}

/**
 * #267: this node view is deliberately built from plain DOM instead of
 * `ReactNodeViewRenderer`.
 *
 * With the React renderer, `splitListItem` (bound to Enter by TaskItem) created
 * the second task item correctly but the caret never moved into it, so the next
 * keystrokes appended to the first item — typing "first", Enter, "second" gave
 * a single item "firstsecond" plus an empty one, persisted as
 * `- [ ] firstsecond\n- [ ] `.
 *
 * Verified with real OS-level key events against a standalone TipTap page:
 * stock `TaskItem` and this plain-DOM node view both keep the caret in the new
 * item, while every `ReactNodeViewRenderer` shape (with/without the checkbox,
 * `contentEditable={false}` or not, content rendered as div/p/default) merged
 * the text. The React wrapper re-creates its host elements around the
 * `contentDOM` during the split, which breaks ProseMirror's DOM-position
 * mapping so the new selection cannot be resolved.
 *
 * The checkbox stays a real React component, mounted into an isolated island
 * that ProseMirror never treats as editable content.
 */
export const TaskItemWithCheckbox = TaskItem.extend({
  addNodeView() {
    return ({ editor, node, getPos }) => {
      const listItem = document.createElement("li");
      listItem.setAttribute("data-type", "taskItem");

      const checkboxHost = document.createElement("div");
      checkboxHost.className = "kaneo-task-item-checkbox";
      // Keep the checkbox outside the editable flow so ProseMirror never maps a
      // document position into it. Set the attribute (not just the property) so
      // it is observable in the serialized DOM.
      checkboxHost.setAttribute("contenteditable", "false");

      // ProseMirror owns this element's children; React must never touch it.
      const contentHost = document.createElement("div");

      listItem.append(checkboxHost, contentHost);

      let root: Root | null = createRoot(checkboxHost);
      let currentNode: ProseMirrorNode = node;

      const toggle = (checked: boolean) => {
        const activeEditor = editor as Editor;
        if (!activeEditor.isEditable) return;
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        activeEditor.view.dispatch(
          activeEditor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...currentNode.attrs,
            checked,
          }),
        );
      };

      const render = () => {
        const checked = Boolean(currentNode.attrs.checked);
        listItem.setAttribute("data-checked", checked ? "true" : "false");
        root?.render(
          <StrictMode>
            <I18nextProvider i18n={i18n}>
              <TaskItemCheckbox
                checked={checked}
                disabled={!(editor as Editor).isEditable}
                onToggle={toggle}
              />
            </I18nextProvider>
          </StrictMode>,
        );
      };

      render();

      return {
        dom: listItem,
        contentDOM: contentHost,
        update(updatedNode) {
          if (updatedNode.type !== currentNode.type) return false;
          currentNode = updatedNode;
          render();
          return true;
        },
        // The checkbox island is React-owned; everything else is ProseMirror's.
        ignoreMutation(mutation) {
          return checkboxHost.contains(mutation.target);
        },
        destroy() {
          const pending = root;
          root = null;
          // Unmounting synchronously inside ProseMirror's teardown warns in
          // React 19, so defer it past the current commit.
          queueMicrotask(() => pending?.unmount());
        },
      };
    };
  },
});
