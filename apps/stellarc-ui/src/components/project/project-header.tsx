import type { ReactNode } from "react";
import OrganizationLayout from "@/components/common/organization-layout";

type ProjectHeaderProps = {
  title: string;
  headerActions?: ReactNode;
  children: ReactNode;
};

/**
 * KFL-366: reuses OrganizationLayout's header, which already keeps
 * breadcrumb/actions usable at 375px (min-w-0 + shrink + truncate on the
 * breadcrumb, shrink-0 on actions) — the same guarantee Board's overview
 * relies on.
 */
export function ProjectHeader({
  title,
  headerActions,
  children,
}: ProjectHeaderProps) {
  return (
    <OrganizationLayout headerActions={headerActions} title={title}>
      {children}
    </OrganizationLayout>
  );
}

export default ProjectHeader;
