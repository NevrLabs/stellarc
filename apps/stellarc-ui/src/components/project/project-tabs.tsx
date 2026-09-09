import { LayoutGrid, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ViewTabs } from "@/components/common/view-tabs";

type ProjectTabsProps = {
  organizationSlug: string;
  projectSlug: string;
  active: "overview" | "tickets";
};

/**
 * Project-local navigation: Overview (root) and Tickets. Route-based tabs, so
 * alias replacement is preserved — the canonical `projectSlug` is passed from
 * the already-resolved Project route and used verbatim in the link params.
 */
export function ProjectTabs({
  organizationSlug,
  projectSlug,
  active,
}: ProjectTabsProps) {
  const { t } = useTranslation();
  return (
    <ViewTabs
      aria-label={t("projects:tabs.label")}
      items={[
        {
          value: "overview",
          label: t("projects:tabs.overview"),
          icon: <LayoutGrid className="size-4" />,
          to: "/dashboard/organization/$organizationSlug/projects/$projectSlug",
          params: { organizationSlug, projectSlug },
        },
        {
          value: "tickets",
          label: t("projects:tabs.tickets"),
          icon: <Ticket className="size-4" />,
          to: "/dashboard/organization/$organizationSlug/projects/$projectSlug/tickets",
          params: { organizationSlug, projectSlug },
        },
      ]}
      value={active}
    />
  );
}

export default ProjectTabs;
