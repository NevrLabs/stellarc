import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import SettingsSectionNav, {
  type SettingsSection,
} from "@/components/settings/settings-section-nav";
import { Button } from "@/components/ui/button";
import getOrganizations from "@/fetchers/organization/get-organizations";
import useGetBoards from "@/hooks/queries/board/use-get-boards";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetRepos from "@/hooks/queries/repo/use-get-repos";
import { authClient } from "@/lib/auth-client";

let hasResolvedActiveOrganization = false;

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings",
)({
  beforeLoad: async () => {
    if (hasResolvedActiveOrganization) return;

    const session = await authClient.getSession();
    if (!session?.data?.session?.activeOrganizationId) {
      const organizations = await getOrganizations();
      if (organizations.length === 0) throw redirect({ to: "/onboarding" });
      await authClient.organization.setActive({
        organizationId: organizations[0].id,
      });
    }
    hasResolvedActiveOrganization = true;
  },
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: organization } = useActiveOrganization();
  const { data: boards } = useGetBoards({
    organizationId: organization?.id ?? "",
  });
  const { data: repos } = useGetRepos({
    organizationId: organization?.id ?? "",
    enabled: organization?.reposEnabled === true,
  });

  const getActiveSection = (): SettingsSection => {
    const pathname = location.pathname;
    if (pathname.includes("/dashboard/settings/organization")) {
      return "organization";
    }
    if (pathname.includes("/dashboard/settings/boards")) {
      return "boards";
    }
    if (pathname.includes("/dashboard/settings/repos")) {
      return "repos";
    }
    return "account";
  };

  const activeSection = getActiveSection();

  return (
    <>
      <PageTitle title={t("navigation:page.settingsTitle")} />
      <div className="flex flex-col gap-4 p-4 bg-sidebar w-full h-full">
        <div className="flex flex-col gap-4 bg-card h-full border border-border rounded-md p-4 relative overflow-hidden">
          {/*
            KFL-188: Back to Dashboard stays TOP LEFT, above the section list,
            exactly where it was in the tab-strip layout — the request was to
            restyle the navigation, not to move the escape hatch.
          */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate({
                  to: "/dashboard/organization/$organizationSlug",
                  params: { organizationSlug: organization?.slug ?? "" },
                })
              }
            >
              <ChevronLeft className=" border border-border rounded-md p-1 size-6" />
              {t("navigation:page.backToOrganization")}
            </Button>

            <h1 className="text-2xl font-semibold pl-2 mt-2">
              {t("navigation:page.settingsTitle")}
            </h1>
          </div>

          {/*
            Two-pane dashboard shape: the section list on the left, the
            selected settings page in the viewport beside it. Each page keeps
            rendering its own nested navigation, so nothing that was reachable
            before becomes unreachable here.
          */}
          <div className="flex min-h-0 flex-1 gap-4">
            <aside className="w-48 shrink-0 overflow-y-auto border-r border-border pr-2">
              <SettingsSectionNav
                activeSection={activeSection}
                hasBoards={(boards?.length ?? 0) > 0}
                hasRepos={(repos?.length ?? 0) > 0}
                onNavigate={(to) => navigate({ to })}
                reposEnabled={organization?.reposEnabled === true}
              />
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
