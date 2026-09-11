import { getApiUrl } from "@/fetchers/get-api-url";

export type Agent = {
  id: string;
  name: string;
  expiresAt: string;
  permissions: Record<string, string[]>;
};

export default async function getAgents(organizationId: string) {
  const response = await fetch(
    getApiUrl(`/agent?organizationId=${encodeURIComponent(organizationId)}`),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as Agent[];
}
