import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { Eye, GitBranch, Plug, Settings } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import SettingsOrgHeader from "@/components/settings/settings-org-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/boards",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { organization, role } = useOrganizationPermission();
  const location = useLocation();
  const navigate = useNavigate();
  const menuItems = [
    {
      title: t("settings:boardGeneral.title"),
      icon: Settings,
      segment: "general",
    },
    {
      title: t("settings:boardVisibility.title"),
      icon: Eye,
      segment: "visibility",
    },
    {
      title: t("settings:boardIntegrations.title"),
      icon: Plug,
      segment: "integrations",
    },
    {
      title: t("settings:boardWorkflow.title"),
      icon: GitBranch,
      segment: "workflow",
    },
  ];
  const { data: boards } = useGetBoards({
    organizationId: organization?.id || "",
  });

  const selectedBoardMatch = location.pathname.match(
    /^\/dashboard\/settings\/boards\/([^/]+)\//,
  );
  const selectedBoardId = selectedBoardMatch?.[1] || "";
  const selectedSegment =
    location.pathname.match(
      /^\/dashboard\/settings\/boards\/[^/]+\/([^/]+)/,
    )?.[1] || "general";

  useEffect(() => {
    const isBoardsRoot =
      location.pathname === "/dashboard/settings/boards" ||
      location.pathname === "/dashboard/settings/boards/";

    if (!isBoardsRoot || !boards || boards.length === 0) {
      return;
    }

    void navigate({
      to: "/dashboard/settings/boards/$boardId/general",
      params: { boardId: boards[0].id },
      replace: true,
    });
  }, [location.pathname, navigate, boards]);

  const selectedBoard = boards?.find((board) => board.id === selectedBoardId);

  return (
    <div className="flex gap-6 h-full">
      <aside className="w-64 flex-shrink-0">
        <div className="p-2">
          <SettingsOrgHeader
            organizationLogo={organization?.logo}
            organizationName={organization?.name}
            role={role}
          />

          <SidebarGroup className="gap-1 p-1">
            <SidebarGroupLabel className="h-7 px-2 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
              {t("navigation:boardSettings.boardLabel")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <Select
                value={selectedBoardId}
                onValueChange={(boardId) => {
                  const nextSegment = menuItems.some(
                    (item) => item.segment === selectedSegment,
                  )
                    ? selectedSegment
                    : "general";

                  void navigate({
                    to: `/dashboard/settings/boards/${boardId}/${nextSegment}`,
                  });
                }}
              >
                <SelectTrigger
                  className="h-8 text-[11px] font-normal text-foreground"
                  size="sm"
                >
                  <span className="truncate font-normal text-foreground">
                    {selectedBoard?.name ||
                      (boards?.length
                        ? t("settings:boardSwitcher.selectBoard")
                        : t("settings:boardSwitcher.noBoards"))}
                  </span>
                </SelectTrigger>
                <SelectContent
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  alignItemWithTrigger={false}
                  className="w-(--anchor-width)"
                >
                  {boards?.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      <span className="font-normal text-foreground">
                        {board.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="gap-1 p-1">
            <SidebarGroupLabel className="h-7 px-2 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
              {t("navigation:page.settingsTitle")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {menuItems.map((item) => {
                  const toUrl = selectedBoard
                    ? `/dashboard/settings/boards/${selectedBoard.id}/${item.segment}`
                    : "/dashboard/settings/boards";
                  const isActive = selectedSegment === item.segment;

                  return (
                    <SidebarMenuItem key={item.title}>
                      <Button
                        render={<Link to={toUrl} />}
                        variant="ghost"
                        size="sm"
                        disabled={!selectedBoard}
                        className={cn(
                          "h-8 w-full justify-start gap-2 rounded-lg px-2 text-[11px] font-normal text-sidebar-foreground/80",
                          isActive &&
                            "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        <span>{item.title}</span>
                      </Button>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      </aside>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
