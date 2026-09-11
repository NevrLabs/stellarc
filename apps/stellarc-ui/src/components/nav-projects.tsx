import { useLocation, useNavigate } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

/**
 * KFL-366: Plan/Projects navigation entry — a single link into the Projects
 * overview, placed before Board/Repo/Table resource navigation. Projects are
 * an outcome-tracking domain and deliberately do NOT get the full
 * create/archive/hide sidebar tree Boards has (no ownership transfer, no
 * Kanban shortcut); that richer tree belongs to KFL-367+ once Projects gain
 * scoped work.
 */
export function NavProjects() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();
  const location = useLocation();

  if (!organization) return null;

  const projectsUrl = `/dashboard/organization/${organization.slug}/projects`;

  return (
    <SidebarGroup className="gap-1 p-2 pb-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-8 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
              isActive={location.pathname.startsWith(projectsUrl)}
              onClick={() => navigate({ to: projectsUrl })}
              size="default"
              tooltip={t("navigation:sidebar.projects")}
            >
              <FolderKanban aria-hidden="true" />
              <span>{t("navigation:sidebar.projects")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export default NavProjects;
