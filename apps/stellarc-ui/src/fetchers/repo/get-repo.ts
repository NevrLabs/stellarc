import { getApiUrl } from "@/fetchers/get-api-url";
import type { Repo } from "@/types/repo";

async function getRepo(id: string) {
  const response = await fetch(getApiUrl(`/repo/${id}`), {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return (await response.json()) as Repo;
}

export default getRepo;
