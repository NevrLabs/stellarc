import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export type HiddenSidebarEntry = {
  id: string;
  name: string;
};

type NavHiddenItemsProps = {
  /** Items hidden from the main list. Nothing renders when this is empty. */
  items: HiddenSidebarEntry[];
  /** Label for the expandable entry, e.g. "More Boards" / "More Repos". */
  label: string;
  /** Stable prefix for testids so boards and repos never collide. */
  testIdPrefix: string;
  onSelect: (id: string) => void;
  isActive?: (id: string) => boolean;
  onIntent?: (id: string) => void;
};

/**
 * "More Boards" / "More Repos": hidden items used to vanish outright, which
 * left no way back to them from the sidebar itself. They now collapse behind a
 * single nav entry that expands in place to reveal the rest.
 */
export function NavHiddenItems({
  items,
  label,
  testIdPrefix,
  onSelect,
  isActive,
  onIntent,
}: NavHiddenItemsProps) {
  const [expanded, setExpanded] = useState(false);

  // No hidden items means no entry at all — an empty "More" row is noise.
  if (items.length === 0) return null;

  return (
    <>
      <SidebarMenuItem data-testid={`${testIdPrefix}-more-item`}>
        <SidebarMenuButton
          aria-expanded={expanded}
          className="h-8 gap-1 ps-3.5 text-sidebar-foreground/70 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
          data-testid={`${testIdPrefix}-more-toggle`}
          onClick={() => setExpanded((open) => !open)}
          size="default"
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span>{label}</span>
          <span className="ml-auto text-[11px] text-sidebar-foreground/60">
            {items.length}
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {expanded &&
        items.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton
              className="h-8 gap-0 ps-7 text-sidebar-foreground/80 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent data-[active=true]:bg-sidebar-accent"
              data-testid={`${testIdPrefix}-more-entry-${item.id}`}
              isActive={isActive?.(item.id) ?? false}
              onClick={() => onSelect(item.id)}
              onMouseEnter={onIntent ? () => onIntent(item.id) : undefined}
              size="default"
            >
              <span className="truncate">{item.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
    </>
  );
}

export default NavHiddenItems;
