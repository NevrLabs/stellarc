import { CircleDot, GitPullRequest, SquareCheck } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export type ReferenceItem = {
  /** Kaneo task id, or repo issue/PR row id. */
  id: string;
  kind: "task" | "issue" | "pull_request";
  /** Display number: task number or GitHub issue/PR number. */
  number: number | null;
  title: string;
  /** "KFL" for tasks, "owner/repo" for GitHub items. */
  scope: string;
  url: string;
};

export type ReferenceListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type ReferenceListProps = {
  items: ReferenceItem[];
  command: (item: ReferenceItem) => void;
};

function kindIcon(kind: ReferenceItem["kind"]) {
  if (kind === "task") return <SquareCheck className="size-3.5 shrink-0" />;
  if (kind === "pull_request")
    return <GitPullRequest className="size-3.5 shrink-0" />;
  return <CircleDot className="size-3.5 shrink-0" />;
}

/**
 * Result list for the `#` reference autocomplete. Mirrors MentionList's
 * keyboard contract so both suggestions behave identically.
 */
const ReferenceList = forwardRef<ReferenceListRef, ReferenceListProps>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    // biome-ignore lint/correctness/useExhaustiveDependencies: reset on items change
    useEffect(() => setSelected(0), [items]);

    const select = (index: number) => {
      const item = items[index];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelected((s) => (s + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          select(selected);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <div className="kaneo-mention-list" data-testid="reference-suggestions">
        {items.map((item, index) => (
          <button
            type="button"
            key={`${item.kind}-${item.id}`}
            className={`kaneo-mention-item${index === selected ? " is-active" : ""}`}
            onClick={() => select(index)}
            onMouseEnter={() => setSelected(index)}
          >
            {kindIcon(item.kind)}
            <span className="font-mono text-xs text-muted-foreground">
              {item.scope}
              {item.number === null ? "" : `#${item.number}`}
            </span>
            <span className="truncate">{item.title}</span>
          </button>
        ))}
      </div>
    );
  },
);

ReferenceList.displayName = "ReferenceList";

export default ReferenceList;
