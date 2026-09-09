import { useRef } from "react";
import type { BoardWithTasks } from "@/types/board";
import { ColumnDropzone } from "./column-dropzone";
import { ColumnHeader } from "./column-header";

type ColumnProps = {
  column: BoardWithTasks["columns"][number];
  disableDragDrop?: boolean;
};

function Column({ column, disableDragDrop = false }: ColumnProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <div className="group relative flex h-full min-h-0 w-full flex-col rounded-xl border border-border/70 bg-muted/40 shadow-xs/5 transition-colors duration-150 hover:border-border/90 dark:bg-card/90">
      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <ColumnHeader column={column} />
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-1 [-webkit-overflow-scrolling:touch]"
        ref={scrollRef}
      >
        <ColumnDropzone
          column={column}
          disableDragDrop={disableDragDrop}
          scrollElementRef={scrollRef}
        />
      </div>
    </div>
  );
}

export default Column;
