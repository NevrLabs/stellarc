import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/get-initials";

type SettingsOrgHeaderProps = {
  organizationName?: string | null;
  organizationLogo?: string | null;
  role?: string | null;
};

/**
 * Organization identity block for a settings sub-sidebar: avatar, name, role.
 *
 * Extracted from the boards settings pane so the repos pane can show the same
 * thing. Duplicating it was the alternative, but then the two settings
 * sections drift — which is exactly how repos ended up without one.
 */
export default function SettingsOrgHeader({
  organizationName,
  organizationLogo,
  role,
}: SettingsOrgHeaderProps) {
  const { t } = useTranslation();
  const initials = getInitials(organizationName ?? undefined, "WS");

  return (
    <div
      className="mb-1 flex items-center gap-3 rounded-md px-2 py-2"
      data-testid="settings-org-header"
    >
      <Avatar className="h-8 w-8">
        <AvatarImage
          alt={organizationName ?? ""}
          src={organizationLogo ?? ""}
        />
        <AvatarFallback
          className="border border-sidebar-border/70 bg-sidebar-accent/70 text-[11px] font-medium text-sidebar-accent-foreground"
          data-testid="settings-org-avatar-fallback"
        >
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <p className="text-sm">{organizationName}</p>
        <p
          className="text-[11px] text-sidebar-foreground/60 capitalize"
          data-testid="settings-org-role"
        >
          {t(`team:roles.${role}`, { defaultValue: role ?? "" })}
        </p>
      </div>
    </div>
  );
}
