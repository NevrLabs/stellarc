/**
 * Extract to-do list progress from a task description.
 *
 * The description is stored as HTML from TipTap's taskList extension.
 * Each item is `<li ... data-checked="true|false">` inside `<ul data-type="taskList">`.
 *
 * Returns null when the description has no task list at all.
 */
export type TodoProgress = {
  completed: number;
  total: number;
};

function parseFromHtml(html: string): TodoProgress | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = Array.from(
    doc.querySelectorAll('ul[data-type="taskList"] li[data-type="taskItem"]'),
  );
  if (items.length === 0) return null;
  let completed = 0;
  for (const item of items) {
    if (item.getAttribute("data-checked") === "true") completed += 1;
  }
  return { completed, total: items.length };
}

export function getTodoProgress(
  description: string | null | undefined,
): TodoProgress | null {
  if (!description) return null;
  return parseFromHtml(description);
}
