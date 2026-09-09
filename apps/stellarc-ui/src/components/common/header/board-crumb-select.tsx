import { ChevronsUpDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import useGetBoards from "@/hooks/queries/board/use-get-boards";

type BoardCrumbSelectProps = {
  organizationId: string;
  boardId: string;
  boardName?: string;
  onSelectBoard: (boardId: string) => void;
  onAddBoard: () => void;
};

export default function BoardCrumbSelect({
  organizationId,
  boardId,
  boardName,
  onSelectBoard,
  onAddBoard,
}: BoardCrumbSelectProps) {
  const { t } = useTranslation();
  const { data: boards = [] } = useGetBoards({ organizationId });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="h-7 justify-between gap-2.5 px-2 text-xs text-foreground"
          />
        }
      >
        <span className="truncate text-left">
          {boardName || t("settings:boardSwitcher.selectBoard")}
        </span>
        <ChevronsUpDown className="size-3 text-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide">
            {t("navigation:sidebar.boards")}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {(boards ?? []).length > 0 ? (
            (boards ?? []).map((board) => {
              return (
                <DropdownMenuItem
                  key={board.id}
                  disabled={board.id === boardId}
                  onClick={() => onSelectBoard(board.id)}
                  className="h-8 gap-2 text-sm"
                >
                  <span className="truncate">{board.name}</span>
                </DropdownMenuItem>
              );
            })
          ) : (
            <DropdownMenuItem
              disabled
              className="h-8 text-sm text-muted-foreground"
            >
              {t("settings:boardSwitcher.noBoards")}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onAddBoard} className="h-8 gap-2 text-sm">
            <Plus className="size-3.5" />
            {t("navigation:boardList.addBoard")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
