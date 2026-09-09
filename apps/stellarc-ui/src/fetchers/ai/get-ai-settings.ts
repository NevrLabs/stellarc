import { getApiUrl } from "@/fetchers/get-api-url";

export type AiSettings = {
  enabled: boolean;
  configured: boolean;
  effectiveTokenLimit: number;
  effectiveCharacterLimit: number;
};

export default async function getAiSettings(organizationId: string) {
  const response = await fetch(
    getApiUrl(`/ai/organization/${organizationId}/settings`),
    { credentials: "include" },
  );
  if (!response.ok) throw new Error(await response.text());
  return (await response.json()) as AiSettings;
}
