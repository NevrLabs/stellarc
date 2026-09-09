import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";

export default function OrganizationCrumbSelect() {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const navigate = useNavigate();

  return (
    <Button
      variant="ghost"
      size="xs"
      className="h-7 justify-between px-2 text-xs text-foreground"
      onClick={() => {
        navigate({
          to: "/dashboard/organization/$organizationSlug",
          params: { organizationSlug: organization?.id },
        });
      }}
    >
      <span className="truncate text-left">
        {organization?.name ||
          t("navigation:organizationSwitcher.selectOrganization")}
      </span>
    </Button>
  );
}
