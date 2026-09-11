import { getApiUrl } from "@/fetchers/get-api-url";

export type CreateAgentPayload = {
  organizationId: string;
  name: string;
  expiresAt: string;
  permissions: Record<string, string[]>;
};

/** The plaintext key is only ever returned here, at creation time. */
export type CreatedAgent = { key: string };

export default async function createAgent(payload: CreateAgentPayload) {
  const response = await fetch(getApiUrl("/agent"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.message ?? "Could not create agent");
  }
  return body as CreatedAgent;
}
