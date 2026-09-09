import type * as React from "react";
import { SidebarResizeHandle } from "@/components/common/sidebar-resize-handle";
import { NavBoards } from "@/components/nav-boards";
import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { NavRepos } from "@/components/nav-repos";
import { NavTables } from "@/components/nav-tables";
import { TeamViewSelector } from "@/components/team-view-selector";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";
import { VersionDisplay } from "@/components/version-display";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useRememberCurrentView } from "@/hooks/use-remembered-view";
import { useUserWebSocket } from "@/hooks/use-user-websocket";
import { cn } from "@/lib/cn";
import Search from "./search";

/**
 * #96 sidebar shape:
 *
 *   Team selector | Sidebar toggle   <- header
 *   Inbox / My Tasks / Members
 *   Boards, Repos
 *   version | Avatar                 <- footer
 *
 * The organization selector and theme toggle moved into the avatar popup at
 * the bottom; the notification bell is gone entirely because it duplicated
 * Inbox. The version number is a discreet marker in the bottom-left corner.
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { data: organization } = useActiveOrganization();
  const organizationInitials = organization?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase())
    .join("");

  // Remember the board/repo view the user is in, for the next time they
  // come back to a board or repo.
  useRememberCurrentView();

  // User-scoped WebSocket for real-time events. This used to be mounted by the
  // organization switcher, which no longer renders in the sidebar.
  useUserWebSocket();

  useRegisterShortcuts({
    modifierShortcuts: {
      [shortcuts.sidebar.prefix]: {
        [shortcuts.sidebar.toggle]: toggleSidebar,
      },
    },
  });

  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      className="border-none pt-1.5"
      {...props}
    >
      <SidebarHeader className="pt-1 pb-1.5">
        <div
          className="flex w-full items-center gap-1"
          data-testid="sidebar-header"
        >
          {/*
            #96: collapsed shows ONLY the sidebar toggle — no team selector.
            The rail is a navigation strip, not a control panel.
          */}
          {!isCollapsed && <TeamViewSelector />}
          <SidebarTrigger
            className={cn("shrink-0", !isCollapsed && "ml-auto")}
            data-testid="sidebar-toggle"
          />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1 overflow-y-auto py-1">
        <Search />
        <NavMain />
        <div
          aria-hidden="true"
          className="mx-2 hidden h-px bg-sidebar-border group-data-[collapsible=icon]:block"
          data-testid="sidebar-main-boards-divider"
        />
        <NavProjects />
        <NavBoards />
        <NavTables />
        <div
          aria-hidden="true"
          className="mx-2 hidden h-px shrink-0 bg-border group-data-[collapsible=icon]:block"
          data-testid="sidebar-boards-repos-divider"
        />
        <NavRepos />
      </SidebarContent>
      <SidebarFooter data-testid="sidebar-footer">
        <div className="flex items-center gap-2">
          <div
            className="flex min-w-0 flex-1 items-center gap-2"
            data-testid="sidebar-organization-identity"
          >
            <Avatar className="size-7 shrink-0 rounded-md">
              <AvatarImage
                alt={organization?.name ?? ""}
                src={organization?.logo ?? ""}
              />
              <AvatarFallback className="rounded-md text-[10px] font-semibold">
                {organizationInitials || "OR"}
              </AvatarFallback>
            </Avatar>
            {state !== "collapsed" && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                  {organization?.name ?? "Organization"}
                </p>
                <VersionDisplay />
              </div>
            )}
          </div>
          {/*
            #96: collapsed shows only the organization logo. The user avatar is
            an extra control in a strip that should read as pure navigation;
            it returns as soon as the sidebar expands.
          */}
          {!isCollapsed && (
            <div className="h-8 w-8 shrink-0">
              <UserAvatar />
            </div>
          )}
        </div>
      </SidebarFooter>
      <SidebarResizeHandle />
    </Sidebar>
  );
}
