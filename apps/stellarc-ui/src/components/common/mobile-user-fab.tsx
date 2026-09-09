import { UserAvatar } from "@/components/user-avatar";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Floating user quick-access control for small screens.
 *
 * On a phone the sidebar is offcanvas, so the account menu (settings, system
 * administration, sign out) is two interactions away: open the sidebar, then
 * find the avatar. This surfaces the SAME `UserAvatar` menu as a fixed control
 * so it is always one tap away.
 *
 * Deliberately reuses `UserAvatar` rather than re-implementing its menu: the
 * items, permissions (`user.role === "admin"`) and sign-out behaviour stay in
 * one place, so this cannot drift out of sync with the sidebar version.
 *
 * Hidden at `md` and above, where the sidebar is persistently visible and a
 * floating duplicate would be redundant.
 */
export function MobileUserFab() {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <div
      // Sits above page content but below dialogs/popovers (z-50), and clears
      // the iOS home indicator via the safe-area inset.
      className="fixed end-4 z-40 md:hidden"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      data-slot="mobile-user-fab"
    >
      <div className="rounded-full border border-border/80 bg-card shadow-lg shadow-black/10 dark:shadow-black/40">
        <UserAvatar />
      </div>
    </div>
  );
}

export default MobileUserFab;
