import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/menu";
import { shortcuts } from "@/constants/shortcuts";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import useGetOrganizations from "@/hooks/queries/organization/use-get-organizations";
import {
  getModifierKeyText,
  useRegisterShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import { authClient } from "@/lib/auth-client";
import type { Organization } from "@/types/organization";

/**
 * #96: the organization selector no longer lives at the top of the sidebar —
 * the top is now the team-view selector. The organization list is rendered as
 * a section inside the user avatar popup menu at the bottom of the sidebar,
 * which is what this component provides.
 */
export function OrganizationMenuSection({
  onCreateOrganization,
}: {
  onCreateOrganization: () => void;
}) {
  const { t } = useTranslation();
  const { data: organization } = useActiveOrganization();
  const { data: organizations } = useGetOrganizations();
  const navigate = useNavigate();

  const [isSwitching, setIsSwitching] = React.useState(false);

  const handleOrganizationChange = React.useCallback(
    async (selectedOrganization: Organization) => {
      if (isSwitching) return;

      setIsSwitching(true);
      try {
        await authClient.organization.setActive({
          organizationId: selectedOrganization.id,
        });

        setTimeout(() => {
          navigate({
            to: "/dashboard/organization/$organizationSlug",
            params: { organizationSlug: selectedOrganization.id },
          });
        }, 50);
      } catch (error) {
        console.error("Failed to switch organization:", error);
      } finally {
        setTimeout(() => setIsSwitching(false), 100);
      }
    },
    [navigate, isSwitching],
  );

  useRegisterShortcuts({
    sequentialShortcuts: {
      [shortcuts.organization.prefix]: {
        [shortcuts.organization.create]: () => {
          onCreateOrganization();
        },
      },
    },
  });

  return (
    <div data-testid="organization-selector">
      {/* Base UI's MenuGroupLabel requires MenuGroup context. Rendering this
          label directly caused production error #31 whenever the profile menu
          opened; mocked unit primitives hid the invalid tree. */}
      <DropdownMenuGroup>
        <DropdownMenuLabel>
          {t("navigation:organizationSwitcher.organizations")}
        </DropdownMenuLabel>
        {organizations?.map((ws: Organization, index: number) => (
          <DropdownMenuItem
            className="h-7 text-sm"
            disabled={isSwitching || ws.id === organization?.id}
            key={ws.id}
            onClick={() => {
              if (!isSwitching && ws.id !== organization?.id) {
                handleOrganizationChange(ws);
              }
            }}
          >
            <span className="flex-1 text-left">
              {isSwitching && ws.id === organization?.id
                ? t("navigation:organizationSwitcher.switching")
                : ws.name}
            </span>
            <DropdownMenuShortcut>
              {getModifierKeyText()} {index > 8 ? "0" : index + 1}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          className="h-7 text-sm"
          onClick={onCreateOrganization}
        >
          <span>{t("navigation:organizationSwitcher.addOrganization")}</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
    </div>
  );
}

export default OrganizationMenuSection;
