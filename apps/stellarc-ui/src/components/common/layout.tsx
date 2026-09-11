import type React from "react";
import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileUserFab } from "@/components/common/mobile-user-fab";
import { useSidebarWidth } from "@/components/common/sidebar-resize-handle";
import { DemoAlert } from "@/components/demo-alert";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isDemoMode } from "@/constants/urls";
import { cn } from "@/lib/cn";
import { useUserPreferencesStore } from "@/store/user-preferences";

type LayoutProps = {
  children: ReactNode;
  className?: string;
};

type HeaderProps = {
  children: ReactNode;
  className?: string;
};

type ContentProps = {
  children: ReactNode;
  className?: string;
};

function LayoutHeader({ children, className }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex h-10 shrink-0 gap-2 transition-[width,height] ease-in-out group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-8 border-b border-border bg-card p-2",
        className,
      )}
    >
      <SidebarTrigger
        className="shrink-0 md:hidden"
        data-testid="mobile-sidebar-toggle"
      />
      {children}
    </header>
  );
}

function LayoutContent({ children, className }: ContentProps) {
  return (
    <div className={cn("flex-1 min-h-0", className)}>
      <div className="md:h-full">{children}</div>
    </div>
  );
}

function Layout({ children, className }: LayoutProps) {
  const { sidebarDefaultOpen, setSidebarDefaultOpen } =
    useUserPreferencesStore();
  /*
    Resizable sidebar: the persisted width (re-clamped for this viewport)
    overrides the CSS default. Everything downstream — gap element, fixed
    container, inset margin — derives from --sidebar-width, so one variable
    resizes the whole layout consistently.
  */
  const sidebarWidth = useSidebarWidth();

  // #125: preference effects moved to the router root so they also apply on
  // routes that do not render <Layout> (Settings in particular).

  return (
    <div className="flex w-full bg-background">
      <SidebarProvider
        defaultOpen={sidebarDefaultOpen}
        onOpenChange={setSidebarDefaultOpen}
        open={sidebarDefaultOpen}
        style={
          {
            "--sidebar-width": sidebarWidth ?? "calc(var(--spacing) * 60)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <AppSidebar />
        <SidebarInset
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background md:m-2 md:h-[calc(100svh-1rem)] md:overflow-auto md:rounded-xl md:border md:border-border/80 md:shadow-sm/5",
            className,
          )}
        >
          {isDemoMode && <DemoAlert />}
          {children}
          <MobileUserFab />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

Layout.Header = LayoutHeader;
Layout.Content = LayoutContent;

export default Layout;
