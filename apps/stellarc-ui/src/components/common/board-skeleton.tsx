import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shape of the four columns the skeleton draws (#111).
 *
 * Card counts taper the way a real board does — a fuller backlog on the left,
 * a couple of finished items on the right. A uniform grid reads as "widget that
 * hasn't loaded"; an uneven one reads as "your board, arriving".
 *
 * `title` drives how many title lines a card gets and how far each one runs, so
 * no two cards are the same height. The widths are fixed rather than random: a
 * skeleton that reshuffles on every render would flicker through the repeated
 * placeholder-data renders this component sits behind on a board switch.
 */
type CardShape = {
  /** Small muted ticket reference (KFL-30) above the title on a real card. */
  ref: string;
  /** One entry per wrapped title line. */
  title: string[];
  /** Label chips; empty for cards that stand in for unlabelled tasks. */
  labels: string[];
  /** Priority / due-date style footer chips. */
  meta: string[];
};

type ColumnShape = {
  key: string;
  /** Header name bar — real column names are not all the same length. */
  nameWidth: string;
  cards: CardShape[];
};

const columnShapes: ColumnShape[] = [
  {
    key: "todo",
    nameWidth: "w-14",
    cards: [
      {
        ref: "w-10",
        title: ["w-full", "w-4/5"],
        labels: ["w-14", "w-10"],
        meta: ["w-8", "w-14"],
      },
      { ref: "w-10", title: ["w-11/12"], labels: ["w-16"], meta: ["w-8"] },
      {
        ref: "w-10",
        title: ["w-full", "w-3/5"],
        labels: [],
        meta: ["w-8", "w-12"],
      },
      { ref: "w-10", title: ["w-5/6"], labels: ["w-12"], meta: ["w-8"] },
    ],
  },
  {
    key: "in-progress",
    nameWidth: "w-24",
    cards: [
      {
        ref: "w-10",
        title: ["w-full", "w-2/3"],
        labels: ["w-12", "w-16"],
        meta: ["w-8", "w-14"],
      },
      {
        ref: "w-10",
        title: ["w-4/5"],
        labels: ["w-14"],
        meta: ["w-8", "w-12"],
      },
      { ref: "w-10", title: ["w-full", "w-3/4"], labels: [], meta: ["w-8"] },
    ],
  },
  {
    key: "in-review",
    nameWidth: "w-20",
    cards: [
      {
        ref: "w-10",
        title: ["w-11/12", "w-1/2"],
        labels: ["w-16"],
        meta: ["w-8", "w-12"],
      },
      { ref: "w-10", title: ["w-3/4"], labels: [], meta: ["w-8"] },
    ],
  },
  {
    key: "done",
    nameWidth: "w-12",
    cards: [
      {
        ref: "w-10",
        title: ["w-5/6"],
        labels: ["w-12"],
        meta: ["w-8", "w-14"],
      },
      { ref: "w-10", title: ["w-full", "w-2/5"], labels: [], meta: ["w-8"] },
    ],
  },
];

type Bar = { id: string; width: string };

/**
 * Pre-resolves every bar to a stable id once, at module load.
 *
 * The shapes above are a fixed literal, so positional ids are stable for the
 * life of the process — but computing them here rather than inline keeps index
 * values out of JSX `key` props entirely.
 */
const skeletonColumns = columnShapes.map((column) => ({
  key: column.key,
  nameWidth: column.nameWidth,
  cards: column.cards.map((card, cardIndex) => {
    const cardId = `${column.key}-card-${cardIndex}`;
    const bars = (widths: string[], kind: string): Bar[] =>
      widths.map((width, i) => ({ id: `${cardId}-${kind}-${i}`, width }));

    return {
      id: cardId,
      ref: card.ref,
      title: bars(card.title, "title"),
      labels: bars(card.labels, "label"),
      meta: bars(card.meta, "meta"),
    };
  }),
}));

/**
 * Kanban-shaped loading placeholder.
 *
 * Shared between the board route (initial load) and BoardLayout, which swaps it
 * in the moment a board switch is clicked — the outgoing route is still mounted
 * at that point, so without this the previous board's cards sit under the new
 * board's name for the whole render.
 *
 * Because it stands in for the board mid-navigation, it has to occupy the space
 * the board is about to: the outer scroller, the column track widths and the
 * column/card chrome all mirror `KanbanBoard` → `Column` → `TaskCard`.
 *
 * The explicit `w-92` matters. The real track is `min-w-80 max-w-96 flex-1`
 * inside a `min-w-max` row, so a loaded column sizes to its widest card and
 * measures 368px — while placeholder bars (percentage widths) have no intrinsic
 * width and collapse the track to the 320px floor. Without `w-92` every column
 * jumped 48px wider the moment real cards landed.
 */
export function BoardSkeleton() {
  return (
    <output
      data-testid="board-skeleton"
      aria-label="Loading board"
      aria-busy="true"
      className="flex h-full w-full flex-col bg-linear-to-b from-muted/20 to-background"
    >
      {/* Mirrors KanbanBoard's scroller so columns sit at the x offsets the
          real ones will. */}
      <div className="min-h-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <div className="flex h-full min-w-max gap-4 px-4 py-4 md:px-5">
          {skeletonColumns.map((column) => (
            <div
              key={column.key}
              data-testid="board-skeleton-column"
              className="h-full w-92 max-w-96 min-w-80 shrink-0 flex-1"
            >
              {/* Column chrome from kanban-board/column/index.tsx. */}
              <div className="flex h-full min-h-0 w-full flex-col rounded-xl border border-border/70 bg-muted/40 shadow-xs/5 dark:bg-card/90">
                <div
                  data-testid="board-skeleton-column-header"
                  className="shrink-0 border-b border-border/60 px-3 py-2"
                >
                  {/* status icon · name · count chip · add button — the row
                      ColumnHeader renders. */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <Skeleton
                        data-testid="board-skeleton-column-name"
                        className={`h-4 ${column.nameWidth} rounded`}
                      />
                      <Skeleton
                        data-testid="board-skeleton-column-count"
                        className="h-4 w-6 rounded-md"
                      />
                    </div>
                    <Skeleton className="h-5 w-5 rounded-md" />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden px-2 py-1">
                  <div className="flex flex-col gap-2 py-1">
                    {column.cards.map((card) => (
                      <div
                        key={card.id}
                        data-testid="board-skeleton-card"
                        className="relative rounded-lg border border-border bg-background p-3 shadow-xs/5"
                      >
                        {/* TaskCard parks the assignee avatar here. */}
                        <Skeleton
                          data-testid="board-skeleton-card-avatar"
                          className="absolute top-3 right-3 h-5 w-5 rounded-full"
                        />

                        <Skeleton
                          data-testid="board-skeleton-card-ref"
                          className={`mb-1.5 h-2.5 ${card.ref} rounded`}
                        />

                        <div className="mb-2.5 flex flex-col gap-1.5 pr-6">
                          {card.title.map((line) => (
                            <Skeleton
                              key={line.id}
                              data-testid="board-skeleton-card-title-line"
                              className={`h-3.5 ${line.width} rounded`}
                            />
                          ))}
                        </div>

                        {card.labels.length > 0 && (
                          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                            {card.labels.map((label) => (
                              <Skeleton
                                key={label.id}
                                data-testid="board-skeleton-card-label"
                                className={`h-4 ${label.width} rounded-full`}
                              />
                            ))}
                          </div>
                        )}

                        <div
                          data-testid="board-skeleton-card-meta"
                          className="flex items-center gap-1.5"
                        >
                          {card.meta.map((chip) => (
                            <Skeleton
                              key={chip.id}
                              className={`h-5 ${chip.width} rounded`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </output>
  );
}
