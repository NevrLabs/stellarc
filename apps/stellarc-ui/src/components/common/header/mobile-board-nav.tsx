import {
  CalendarDays,
  CalendarRange,
  Check,
  Menu,
  Plus,
  SquareKanban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import icons from "@/constants/board-icons";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { cn } from "@/lib/cn";

type MobileBoardNavProps = {
  organizationId: string;
  boardId: string;
  activeView: "backlog" | "board" | "gantt" | "calendar" | "milestones";
  onSelectBoardView: () => void;
  onSelectBacklog: () => void;
  onSelectGantt: () => void;
  onSelectCalendar: () => void;

  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => void;
};

export default function MobileBoardNav({
  organizationId,
  boardId,
  activeView,
  onSelectBoardView,
  onSelectBacklog,
  onSelectGantt,
  onSelectCalendar,

  onSelectBoard,
  onAddBoard,
}: MobileBoardNavProps) {
  const { data: boards = [] } = useGetBoards({ organizationId });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-7 border border-transparent"
          />
        }
      >
        <Menu className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              View
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={onSelectBacklog}
                className={cn(
                  "flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  activeView === "backlog"
                    ? "border-border bg-secondary text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                Backlog
              </button>
              <button
                type="button"
                onClick={onSelectBoardView}
                className={cn(
                  "flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  activeView === "board"
                    ? "border-border bg-secondary text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                <SquareKanban className="size-3.5" />
                Board
              </button>
              <button
                type="button"
                onClick={onSelectGantt}
                className={cn(
                  "flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  activeView === "gantt"
                    ? "border-border bg-secondary text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                <CalendarDays className="size-3.5" />
                Timeline
              </button>
              <button
                type="button"
                onClick={onSelectCalendar}
                className={cn(
                  "flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  activeView === "calendar"
                    ? "border-border bg-secondary text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent",
                )}
              >
                <CalendarRange className="size-3.5" />
                Calendar
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <p className="px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Boards
            </p>
            <div className="max-h-56 space-y-0.5 overflow-y-auto">
              {(boards ?? []).map((board) => {
                const Icon =
                  icons[board.icon as keyof typeof icons] || icons.Layout;
                const isCurrentBoard = board.id === boardId;

                return (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => onSelectBoard(board.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      isCurrentBoard
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className="flex-1 truncate">{board.name}</span>
                    {isCurrentBoard && <Check className="size-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={onAddBoard}
            className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
          >
            <Plus className="size-3.5" />
            Add board
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
