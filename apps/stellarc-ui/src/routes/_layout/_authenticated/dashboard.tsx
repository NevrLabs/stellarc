import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import AiChatBubble from "@/components/ai/ai-chat-bubble";
import PageTitle from "@/components/page-title";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

export const Route = createFileRoute("/_layout/_authenticated/dashboard")({
  component: DashboardLayoutComponent,
});

function DashboardLayoutComponent() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();

  return (
    <>
      <PageTitle
        title={t("navigation:page.boardsTitle")}
        hideAppName={!organization?.name}
      />
      <Outlet />
      <AiChatBubble />
    </>
  );
}
