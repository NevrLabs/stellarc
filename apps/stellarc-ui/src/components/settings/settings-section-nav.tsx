import type { LucideIcon } from "lucide-react";
import { Building2, FolderGit2, LayoutGrid, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export type SettingsSection = "account" | "organization" | "boards" | "repos";

type SettingsSectionNavProps = {
  activeSection: SettingsSection;
  hasBoards: boolean;
  hasRepos: boolean;
  reposEnabled: boolean;
  onNavigate: (to: string) => void;
};

type SectionDefinition = {
  id: SettingsSection;
  icon: LucideIcon;
  labelKey: string;
  fallbackLabel: string;
  /**
   * Sections land on a concrete page, not a bare section route — the old tab
   * strip did this and dropping it would leave the user on an empty shell.
   */
  to: string;
};

const SECTIONS: SectionDefinition[] = [
  {
    id: "account",
    icon: User,
    labelKey: "settings:account",
    fallbackLabel: "Account",
    to: "/dashboard/settings/account/information",
  },
  {
    id: "organization",
    icon: Building2,
    labelKey: "navigation:page.settingsOrganizationTab",
    fallbackLabel: "Organization",
    to: "/dashboard/settings/organization/general",
  },
  {
    id: "boards",
    icon: LayoutGrid,
    labelKey: "navigation:sidebar.boards",
    fallbackLabel: "Boards",
    to: "/dashboard/settings/boards",
  },
  {
    id: "repos",
    icon: FolderGit2,
    labelKey: "navigation:sidebar.repos",
    fallbackLabel: "Repos",
    to: "/dashboard/settings/repos",
  },
];

/**
 * KFL-188: the settings section list, as a dashboard-style vertical sidebar
 * instead of the previous horizontal tab strip.
 *
 * This is a RESTYLE, so it deliberately preserves the tab strip's conditional
 * behaviour rather than simplifying it: Repos is hidden outright when the
 * organization has repos disabled, and a section with nothing in it is
 * rendered but non-navigable (disabled) so its absence is never mistaken for
 * a missing feature.
 */
export default function SettingsSectionNav({
  activeSection,
  hasBoards,
  hasRepos,
  reposEnabled,
  onNavigate,
}: SettingsSectionNavProps) {
  const { t } = useTranslation();

  const isDisabled = (id: SettingsSection) => {
    if (id === "boards") return !hasBoards;
    if (id === "repos") return !hasRepos;
    return false;
  };

  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-0.5">
      {SECTIONS.filter((section) => section.id !== "repos" || reposEnabled).map(
        (section) => {
          const disabled = isDisabled(section.id);
          const active = activeSection === section.id;
          const Icon = section.icon;

          return (
            <button
              aria-current={active ? "page" : undefined}
              aria-disabled={disabled ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
              data-active={active ? "true" : undefined}
              data-testid={`settings-section-${section.id}`}
              disabled={disabled}
              key={section.id}
              onClick={() => {
                if (disabled) return;
                onNavigate(section.to);
              }}
              type="button"
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">
                {t(section.labelKey, { defaultValue: section.fallbackLabel })}
              </span>
            </button>
          );
        },
      )}
    </nav>
  );
}
