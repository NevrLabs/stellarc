import type { ReactNode } from "react";
import Layout from "@/components/common/layout";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import useActiveOrganization from "@/hooks/queries/organization/use-active-organization";
import { cn } from "@/lib/cn";

type OrganizationLayoutProps = {
  title: string;
  headerNavigation?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  onCreateBoard?: () => void;
  className?: string;
};

export default function OrganizationLayout({
  title,
  headerNavigation,
  headerActions,
  children,
  className,
}: OrganizationLayoutProps) {
  const { data: organization } = useActiveOrganization();

  return (
    <Layout>
      <Layout.Header>
        <div className="flex w-full min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {/*
              The breadcrumb is the only expendable element in this row: on a
              phone the organization name plus page title can consume the width
              the tab group needs, which previously let header actions paint
              over the tabs. Allow it to shrink and truncate, and drop the
              organization crumb below `sm` where space is tightest.
            */}
            <Breadcrumb className="flex h-8 min-w-0 shrink items-center gap-1 overflow-hidden text-xs">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="hidden sm:inline-flex">
                  <BreadcrumbLink href="/">
                    <span className="text-xs font-normal text-card-foreground">
                      {organization?.name}
                    </span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block" />
                <BreadcrumbItem className="min-w-0">
                  <span
                    className="block truncate text-xs font-normal text-card-foreground"
                    title={title}
                  >
                    {title}
                  </span>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            {headerNavigation}
          </div>
          <div
            className={`${cn("flex shrink-0 items-center gap-1.5", className)}`}
          >
            {headerActions}
          </div>
        </div>
      </Layout.Header>
      <Layout.Content>{children}</Layout.Content>
    </Layout>
  );
}
