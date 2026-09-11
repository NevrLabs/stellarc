import { getApiUrl } from "@/fetchers/get-api-url";

async function deleteRepo(repoId: string): Promise<void> {
  const response = await fetch(getApiUrl(`/repo/${repoId}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to delete repo");
  }
}

export default deleteRepo;
