import { FileTree, useFileTree } from "@pierre/trees/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";

type PullRequestFileTreeProps = {
  filenames: string[];
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
  /** Distinguishes the inline panel from the fullscreen one. */
  idPrefix: string;
  /** Controlled open state so the panel persists across file jumps. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fullscreen lives inside a fixed-height dialog, so the tree stretches to its
   * parent instead of using a viewport-derived height.
   */
  fillHeight?: boolean;
  stickyTop?: number;
  showHeader?: boolean;
};

/**
 * Changed-files tree for a pull request, laid out the way GitHub does it: a
 * hideable column on the **left** of the diff, sticky to the viewport, with the
 * diff filling the remaining width.
 *
 * Two earlier shapes were wrong and are deliberately not repeated:
 * - A dismissing Popover closed itself on every file jump.
 * - An absolutely-positioned overlay floated *on top of* the diff, covering
 *   code and colliding with the file header controls.
 *
 * Reuses the Code Explorer's `@pierre/trees` FileTree so the pull request diff
 * and the repository browser share one tree implementation.
 */
export default function PullRequestFileTree({
  filenames,
  selectedPath,
  onSelect,
  idPrefix,
  open,
  onOpenChange,
  fillHeight = false,
  stickyTop,
  showHeader = true,
}: PullRequestFileTreeProps) {
  // Directory paths must be present for @pierre/trees to nest children under a
  // folder; a bare list of file paths renders flat.
  const paths = useMemo(() => {
    const directories = new Set<string>();
    for (const filename of filenames) {
      const segments = filename.split("/");
      segments.pop();
      let prefix = "";
      for (const segment of segments) {
        prefix = prefix ? `${prefix}/${segment}` : segment;
        directories.add(`${prefix}/`);
      }
    }
    return [...[...directories].sort(), ...[...filenames].sort()];
  }, [filenames]);

  const { model } = useFileTree({
    itemHeight: 26,
    onSelectionChange: (selectedPaths) => {
      const file = selectedPaths.find((path) => !path.endsWith("/"));
      // Deliberately does not close the panel: the reader keeps navigating.
      if (file) onSelect(file);
    },
    paths: [],
  });

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

  useEffect(() => {
    if (!selectedPath) return;
    model.getItem(selectedPath)?.select();
  }, [model, selectedPath]);

  const fileCount = `${filenames.length} ${
    filenames.length === 1 ? "file" : "files"
  }`;

  if (!open) {
    return (
      <div className="shrink-0">
        <Button
          aria-expanded={false}
          aria-label="Show changed files"
          data-testid={`${idPrefix}-file-tree-toggle`}
          onClick={() => onOpenChange(true)}
          size="icon-sm"
          title={`Show changed files (${fileCount})`}
          variant="outline"
        >
          <PanelLeftOpen className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Changed files"
      // A real column to the LEFT of the diff (not an overlay): the diff sits
      // beside it and keeps its own scrolling.
      className={`w-64 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-card ${
        fillHeight ? "flex h-full" : "sticky hidden self-start md:flex"
      }`}
      data-testid={`${idPrefix}-file-tree-sidebar`}
      style={
        stickyTop === undefined
          ? undefined
          : { top: stickyTop, height: `calc(100dvh - ${stickyTop + 16}px)` }
      }
    >
      {showHeader ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-2 py-1.5">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {fileCount}
          </span>
          <Button
            aria-expanded={true}
            aria-label="Hide changed files"
            data-testid={`${idPrefix}-file-tree-toggle`}
            onClick={() => onOpenChange(false)}
            size="icon-sm"
            title="Hide changed files"
            variant="ghost"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
      ) : null}
      <div
        // The tree virtualizes against its own box, so it needs a resolved
        // height: with only max-height it collapses to zero and renders blank.
        className={
          fillHeight || stickyTop !== undefined
            ? "min-h-0 flex-1 overflow-hidden p-1"
            : "h-[calc(100vh-16rem)] min-h-[16rem] overflow-hidden p-1"
        }
        data-testid={`${idPrefix}-file-tree`}
      >
        <FileTree className="h-full" model={model} />
      </div>
    </aside>
  );
}
