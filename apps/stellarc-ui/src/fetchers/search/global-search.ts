import { client } from "@kaneo/libs";

type SearchParams = {
  q: string;
  type?:
    | "all"
    | "tasks"
    | "boards"
    | "organizations"
    | "comments"
    | "activities"
    | "repositories"
    | "issues"
    | "pullRequests";
  organizationId?: string;
  boardId?: string;
  limit?: number;
};

async function globalSearch(params: SearchParams) {
  const queryParams = {
    ...params,
    limit: params.limit?.toString(),
  };

  const response = await client.search.$get({
    query: queryParams,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default globalSearch;
