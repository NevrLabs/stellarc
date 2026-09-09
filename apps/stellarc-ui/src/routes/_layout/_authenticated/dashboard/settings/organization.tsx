import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import {
  Eye,
  FileText,
  FlaskConical,
  Plug,
  Settings,
  Shield,
  Tag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useOrganizationPermission } from "@/hooks/use-organization-permission";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/organization",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { organization, role } = useOrganizationPermission();
  const location = useLocation();
  const menuItems = [
    {
      title: t("settings:organizationGeneral.title"),
      url: "/dashboard/settings/organization/general",
      icon: Settings,
    },
    {
      title: t("settings:organizationRoles.title", { defaultValue: "Roles" }),
      url: "/dashboard/settings/organization/roles",
      icon: Shield,
    },
    {
      title: "Visibility",
      url: "/dashboard/settings/organization/visibility",
      icon: Eye,
    },

    {
      title: t("settings:organizationLabels.title", { defaultValue: "Labels" }),
      url: "/dashboard/settings/organization/labels",
      icon: Tag,
    },
    {
      title: "Templates",
      url: "/dashboard/settings/organization/templates",
      icon: FileText,
    },
    {
      title: "Connections",
      url: "/dashboard/settings/organization/connections",
      icon: Plug,
    },
    {
      title: "Features",
      url: "/dashboard/settings/organization/features",
      icon: FlaskConical,
    },
  ];
  const isActivePath = (path: string) => location.pathname === path;
  const organizationInitials = getInitials(organization?.name, "WS");

  return (
    <div className="flex gap-6 h-full">
      <aside className="w-64 flex-shrink-0">
        <div className="p-2">
          <div className="mb-1 flex items-center gap-3 rounded-md px-2 py-2">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={organization?.logo ?? ""}
                alt={organization?.name || ""}
              />
              <AvatarFallback className="border border-sidebar-border/70 bg-sidebar-accent/70 text-[11px] font-medium text-sidebar-accent-foreground">
                {organizationInitials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <p className="text-sm">{organization?.name}</p>
              <p className="text-[11px] text-sidebar-foreground/60 capitalize">
                {t(`team:roles.${role}`, { defaultValue: role })}
              </p>
            </div>
          </div>

          <SidebarGroup className="gap-1 p-1">
            <SidebarGroupLabel className="h-7 px-2 text-[11px] uppercase tracking-wide text-sidebar-foreground/70">
              {t("navigation:page.settingsOrganizationTab")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <Button
                      render={<Link to={item.url} />}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 w-full justify-start gap-2 rounded-lg px-2 text-[11px] font-normal text-sidebar-foreground/80",
                        isActivePath(item.url) &&
                          "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Button>
                  </SidebarMenuItem>
                ))}
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
