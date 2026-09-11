import { getApiUrl } from "../get-api-url";

export type ResolvedTicketIdentity = {
  ticketId: string;
  ticketKey: string;
  number: number;
  title: string;
  organization: { id: string; slug: string };
  board: { id: string; key: string };
  resolution: {
    usedOrganizationAlias: boolean;
    usedBoardAlias: boolean;
    usedLegacyId: boolean;
  };
};

export async function resolveTicketIdentity(
  organizationSlug: string,
  ticketKey: string,
): Promise<ResolvedTicketIdentity> {
  const response = await fetch(
    getApiUrl(
      `/organization/${encodeURIComponent(organizationSlug)}/ticket/${encodeURIComponent(ticketKey)}`,
    ),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error("Ticket not found");
  return response.json() as Promise<ResolvedTicketIdentity>;
}
