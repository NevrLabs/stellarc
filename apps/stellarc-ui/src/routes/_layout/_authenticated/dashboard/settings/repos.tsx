import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { Eye } from "lucide-react";
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
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/repos",
)({ component: RepoSettings });

/**
 * Repos settings pane.
 *
 * Mirrors the boards settings pane deliberately: same org header, same
 * SidebarGroup rhythm, same resource-picker-then-menu order. The two sections
 * previously looked like different products — repos had no org identity block
 * at all, and its Visibility control was a plain Button that navigated
 * nowhere.
 */
function RepoSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { organization, role } = useOrganizationPermission();
  const { data: repos = [] } = useGetRepos({
    organizationId: organization?.id ?? "",
  });

  const menuItems = [
    {
      title: t("settings:repoVisibility.title", { defaultValue: "Visibility" }),
      icon: Eye,
      segment: "visibility",
    },
  ];

  const selectedRepoId =
    location.pathname.match(/^\/dashboard\/settings\/repos\/([^/]+)/)?.[1] ??
    "";
  const selectedSegment =
    location.pathname.match(
      /^\/dashboard\/settings\/repos\/[^/]+\/([^/]+)/,
    )?.[1] || "visibility";
  const selectedRepo = repos.find((repo) => repo.id === selectedRepoId);

  useEffect(() => {
    if (
      (location.pathname === "/dashboard/settings/repos" ||
        location.pathname === "/dashboard/settings/repos/") &&
      repos[0]
    ) {
      void navigate({
        to: "/dashboard/settings/repos/$repoId/visibility",
        params: { repoId: repos[0].id },
        replace: true,
      });
    }
  }, [location.pathname, navigate, repos]);

  return (
    <div className="flex h-full gap-6">
      <aside className="w-64 flex-shrink-0">
        <div className="p-2">
          <SettingsOrgHeader
            organizationLogo={organization?.logo}
            organizationName={organization?.name}
            role={role}
          />

          <SidebarGroup className="gap-1 p-1">
            <SidebarGroupLabel className="h-7 px-2 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
              {t("navigation:repoSettings.repoLabel", {
                defaultValue: "Repository",
              })}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <Select
                onValueChange={(repoId) =>
                  void navigate({
                    to: "/dashboard/settings/repos/$repoId/visibility",
                    params: { repoId },
                  })
                }
                value={selectedRepoId}
              >
                <SelectTrigger
                  className="h-8 text-[11px] font-normal text-foreground"
                  size="sm"
                >
                  <span className="truncate font-normal text-foreground">
                    {selectedRepo
                      ? `${selectedRepo.owner}/${selectedRepo.name}`
                      : t("settings:repoSwitcher.selectRepo", {
                          defaultValue: "Select repository",
                        })}
                  </span>
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  className="w-(--anchor-width)"
                  side="bottom"
                  sideOffset={6}
                >
                  {repos.map((repo) => (
                    <SelectItem key={repo.id} value={repo.id}>
                      <span className="font-normal text-foreground">
                        {repo.owner}/{repo.name}
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
                  const toUrl = selectedRepo
                    ? `/dashboard/settings/repos/${selectedRepo.id}/${item.segment}`
                    : "/dashboard/settings/repos";
                  const isActive = selectedSegment === item.segment;

                  return (
                    <SidebarMenuItem key={item.title}>
                      <Button
                        className={cn(
                          "h-8 w-full justify-start gap-2 rounded-lg px-2 text-[11px] font-normal text-sidebar-foreground/80",
                          isActive &&
                            "bg-sidebar-accent text-sidebar-accent-foreground",
                        )}
                        disabled={!selectedRepo}
                        render={<Link to={toUrl} />}
                        size="sm"
                        variant="ghost"
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

      <div className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
