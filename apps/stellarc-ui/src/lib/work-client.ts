/**
 * STL-16 §3: REST client for the work API (/api/work/*). Mutations return
 * {data, txid}; deletes {id}. The bearer grammar "Bearer <org> <principal>"
 * is what work-http's session() parses — org/principal are recorded by
 * work-live-store when the live collections attach for the active org.
 */

export type WorkMutationEnvelope<T> = { data: T; txid: number };

let authState = { org: "", principal: "" };

/** Record the org/principal the live collections attached with. */
export function setWorkAuth(org: string, principal: string): void {
  authState = { org, principal };
}

/** Current bearer header value for work requests (empty when unattached). */
export function workAuthorization(): string {
  const { org, principal } = authState;
  const bearer = `Bearer ${org} ${principal}`;
  return org && principal ? bearer : "";
}

export async function workFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(`/api/work${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(workAuthorization() ? { authorization: workAuthorization() } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
  return (await response.json()) as T;
}
