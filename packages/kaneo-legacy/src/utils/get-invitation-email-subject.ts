import { getOrganizationInvitationEmailCopy } from "./get-organization-invitation-email-copy";

export function getInvitationEmailSubject(
  locale: string | null,
  inviterName: string,
  organizationName: string,
) {
  const values: Record<string, string> = { inviterName, organizationName };

  return getOrganizationInvitationEmailCopy(locale).subject.replace(
    /\{\{(\w+)\}\}/g,
    (_match, key: string) => values[key] ?? "",
  );
}
