import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Keyboard, LogOut, Mail, Settings, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { openKeyboardShortcutsHelp } from "@/components/keyboard-shortcuts-help";
import { OrganizationMenuSection } from "@/components/organization-switcher";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import CreateOrganizationModal from "@/components/shared/modals/create-organization-modal";
import { ThemeToggleDropdown } from "@/components/theme-toggle-dropdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import { Separator } from "@/components/ui/separator";
import useSignOut from "@/hooks/mutations/use-sign-out";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import { usePendingInvitations } from "@/hooks/queries/invitation/use-pending-invitations";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { getAvatarTone } from "@/lib/avatar-tone";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import useBoardStore from "@/store/board";

export function UserAvatar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: config } = useGetConfig();
  const { mutateAsync: signOut, isPending } = useSignOut(
    config?.customOAuthLogoutUrl,
  );
  const queryClient = useQueryClient();
  const { setBoard } = useBoardStore();
  const navigate = useNavigate();
  const { data: invitations = [] } = usePendingInvitations();
  const { data: organization } = useActiveOrganization();
  const [isCreateOrganizationModalOpen, setIsCreateOrganizationModalOpen] =
    useState(false);

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.clear();
      setBoard(undefined);
      toast.success(t("navigation:userMenu.signedOutSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("navigation:userMenu.signOutFailed"),
      );
    }
  };

  const handleSettings = () => {
    navigate({ to: "/dashboard/settings/account/information" });
  };

  const initials = getInitials(user.name || user.email, "UN");
  const tone = getAvatarTone(user.id, user.email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Open profile menu"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full p-0 hover:bg-sidebar-accent/70"
          >
            <Avatar className={`h-8 w-8 ${tone}`}>
              <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
              <AvatarFallback className="bg-transparent text-xs font-medium border border-border/30">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-52 p-0" side="bottom" align="start">
          <div className="px-2.5 py-2">
            <div className="flex items-center gap-2 text-left text-sm">
              <Avatar className={`h-7 w-7 rounded-full ${tone}`}>
                <AvatarImage src={user.image ?? ""} alt={user.name || ""} />
                <AvatarFallback className="rounded-full bg-transparent border border-border/30">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {user.name || t("navigation:userMenu.unnamedUser")}
                </span>
                {user.email && (
                  <span className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/*
          #96: the organization selector moved out of the sidebar header into
          this menu, alongside the theme toggle. The sidebar top now hosts the
          team-view selector instead.
        */}
          <div className="p-0.5">
            <OrganizationMenuSection
              onCreateOrganization={() =>
                setIsCreateOrganizationModalOpen(true)
              }
            />
          </div>

          {/*
          #155: no separator here. OrganizationMenuSection already renders its
          own trailing rule, so adding a second one drew a doubled divider.
        */}

          <div className="p-0.5">
            <DropdownMenuItem
              onClick={handleSettings}
              className="h-7 gap-2 px-2 text-sm font-normal"
            >
              <Settings className="size-3.5" />
              {t("navigation:userMenu.settings")}
            </DropdownMenuItem>
            {/*
            Invitations are account-scoped, not organization-scoped, so they
            belong beside Settings rather than in the organization's sidebar
            navigation. The pending count is surfaced here so it stays visible
            now that the sidebar entry is gone.
          */}
            <DropdownMenuItem
              onClick={() => navigate({ to: "/dashboard/invitations" })}
              className="h-7 gap-2 px-2 text-sm font-normal"
            >
              <Mail className="size-3.5" />
              {t("navigation:sidebar.invitations")}
              {invitations.length > 0 && (
                <span className="ms-auto flex h-5 min-w-5 items-center justify-center rounded-sm border border-border/60 px-1 text-[11px] font-medium text-muted-foreground">
                  {invitations.length}
                </span>
              )}
            </DropdownMenuItem>
            {/*
            #145: Trash moved out of the main sidebar nav into this menu. It is
            a recovery surface visited occasionally, so it does not need a
            permanent nav slot — but it stays reachable here. Organization
            -scoped, so it only renders once an organization is resolved.
          */}
            {organization && (
              <DropdownMenuItem
                onClick={() =>
                  navigate({
                    to: `/dashboard/organization/${organization.slug}/trash`,
                  })
                }
                className="h-7 gap-2 px-2 text-sm font-normal"
              >
                <Trash2 className="size-3.5" />
                {t("navigation:sidebar.trash")}
              </DropdownMenuItem>
            )}
            {/*
            #115: the shortcuts help lives here, next to the other
            account-level entries. The dialog itself is mounted once at the app
            root, so this only has to ask it to open.
          */}
            <DropdownMenuItem
              className="h-7 gap-2 px-2 text-sm font-normal"
              data-testid="profile-menu-shortcuts"
              onClick={() => openKeyboardShortcutsHelp()}
            >
              <Keyboard className="size-3.5" />
              {t("navigation:keyboardShortcuts.title")}
            </DropdownMenuItem>
            {user.role === "admin" && (
              <DropdownMenuItem
                onClick={() => navigate({ to: "/dashboard/admin" })}
                className="h-7 gap-2 px-2 text-sm font-normal"
              >
                <Shield className="size-3.5" />
                System administration
              </DropdownMenuItem>
            )}
          </div>

          {/*
          #155: requested order is nameplate -> org -> settings -> theme ->
          logout, so the theme row sits below the settings group rather than
          above it.
        */}
          <DropdownMenuSeparator data-testid="user-menu-theme-separator" />

          <div className="p-0.5">
            <div
              className="flex h-7 items-center justify-between gap-2 px-2 text-sm font-normal"
              data-testid="user-menu-theme-toggle"
            >
              <span>{t("navigation:userMenu.theme")}</span>
              <ThemeToggleDropdown />
            </div>
          </div>

          <DropdownMenuSeparator />

          <div className="p-0.5">
            {/* #155: destructive styling — logging out ends the session. */}
            <DropdownMenuItem
              onClick={handleSignOut}
              disabled={isPending}
              className="h-7 gap-2 px-2 text-sm font-normal text-destructive focus:text-destructive data-highlighted:text-destructive"
              data-testid="user-menu-logout"
            >
              <LogOut className="size-3.5" />
              {isPending
                ? t("navigation:userMenu.signingOut")
                : t("navigation:userMenu.logOut")}
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationModal
        onClose={() => setIsCreateOrganizationModalOpen(false)}
        open={isCreateOrganizationModalOpen}
      />
    </>
  );
}
