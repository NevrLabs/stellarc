import { getApiUrl } from "@/fetchers/get-api-url";

export default async function deleteAgent(id: string) {
  const response = await fetch(getApiUrl(`/agent/${id}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await response.text());
}
