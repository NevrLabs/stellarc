import { getApiUrl } from "@/fetchers/get-api-url";

export type LinkedAuthenticationIdentity = {
  id: string;
  providerId: string;
  providerName: string;
  accountId: string;
  linkedAt: string;
};

export type AccountAuthentication = {
  identities: LinkedAuthenticationIdentity[];
  providers: Array<{ providerId: string; providerName: string }>;
};

export async function getLinkedAuthenticationIdentities() {
  const response = await fetch(
    getApiUrl("/account-authentication/identities"),
    {
      credentials: "include",
    },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AccountAuthentication;
}
